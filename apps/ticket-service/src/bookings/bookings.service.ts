import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import type Redis from 'ioredis';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCancelRequest,
  BookingDto,
  BookingGetRequest,
  BookingListRequest,
  Empty,
  HoldResponse,
  HoldSeatsRequest,
  PaginatedBookings,
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentSyncRequest,
  PaymentWebhookRequest,
  ReconcileResult,
  rpcErrorPayload,
  TicketByCodeRequest,
  TicketDto,
  TicketList,
  TicketLookupDto,
  getBookingMeters,
  withSpan,
} from '@ticketing/shared';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { BookingEventPublisher } from '../events/booking-event.publisher';
import { LockHandle, REDIS_CLIENT, SeatLockService } from '../lock/lock.module';
import { CustomerDirectoryService } from '../user/customer-directory.service';
import { PaymentService } from '../payments/payment.service';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';
import { generateTicketCode } from './ticket-code';

const HOLD_TTL_MS = 5 * 60_000; // must match the redlock TTL in hold
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEATS_PER_HOLD = 8;

/**
 * Bookings flow: hold (redlock multi-seat lock + PENDING booking) →
 * charge (Xendit hosted invoice, returns checkoutUrl) →
 * webhook (Xendit callback confirms PAID → CONFIRMED + tickets,
 * EXPIRED/FAILED → CANCELLED) → cancel/expire release locks.
 *
 * Redis is the concurrency layer; the UNIQUE (showtime_id, seat_id) index
 * on booking_seats is the hard double-booking guard.
 */
@Injectable()
export class BookingsService {
  /** Active redlock handles keyed by booking id, so confirm/cancel can
   *  extend/release early instead of waiting for the TTL. */
  private readonly activeLocks = new Map<string, LockHandle>();
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    @InjectRepository(BookingSeat)
    private readonly bookingSeats: Repository<BookingSeat>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Ticket)
    private readonly tickets: Repository<Ticket>,
    private readonly seatAvailability: SeatAvailabilityService,
    private readonly seatLock: SeatLockService,
    private readonly payment: PaymentService,
    private readonly events: BookingEventPublisher,
    private readonly customers: CustomerDirectoryService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async hold(dto: HoldSeatsRequest): Promise<HoldResponse> {
    if (dto.seatIds.length === 0) {
      throw new RpcException(
        rpcErrorPayload(400, 'At least one seat is required'),
      );
    }
    const seatIds = [...new Set(dto.seatIds)];
    if (seatIds.length > MAX_SEATS_PER_HOLD) {
      throw new RpcException(
        rpcErrorPayload(
          400,
          `A maximum of ${MAX_SEATS_PER_HOLD} seats can be held at once`,
        ),
      );
    }

    let seatMap: Awaited<ReturnType<SeatAvailabilityService['validateSeats']>>;
    try {
      seatMap = await this.seatAvailability.validateSeats(
        dto.showtimeId,
        seatIds,
      );
    } catch (err) {
      throw new RpcException(
        rpcErrorPayload(
          404,
          err instanceof Error ? err.message : 'Seats are not available',
        ),
      );
    }

    const keys = seatIds.map((sid) =>
      this.seatLock.lockKey(dto.showtimeId, sid),
    );

    let handle: LockHandle;
    try {
      handle = await withSpan(
        'seats.hold',
        () => this.seatLock.hold(keys, HOLD_TTL_MS),
        { 'showtime.id': dto.showtimeId, 'seat.count': seatIds.length },
      );
    } catch (err) {
      // A down/unreachable Redis must not masquerade as "seat taken".
      if (this.isRedisUnavailable(err)) {
        getBookingMeters().holds.add(1, { status: 'unavailable' });
        throw new RpcException(
          rpcErrorPayload(503, 'Seat lock unavailable, please retry'),
        );
      }
      getBookingMeters().holds.add(1, { status: 'conflict' });
      throw new RpcException(
        rpcErrorPayload(409, 'Some seats are already held'),
      );
    }

    const expiresAt = new Date(Date.now() + HOLD_TTL_MS);
    const priceAmount = seatMap.seatMap.price.amount;
    const totalAmount = seatMap.seats.length * priceAmount;

    const booking = this.bookings.create({
      userId: dto.userId,
      showtimeId: dto.showtimeId,
      totalAmount,
      currency: 'IDR',
      status: 'PENDING',
      expiresAt,
    });

    let savedBookingId: string | undefined;
    try {
      const saved = await this.bookings.save(booking);
      savedBookingId = saved.id;
      this.activeLocks.set(saved.id, handle);

      // The UNIQUE (showtime_id, seat_id) index spans every row ever
      // written, including CANCELLED / EXPIRED / timed-out PENDING holds.
      // Clear those dead rows for these seats first so a freed seat can be
      // re-booked; rows backing a live PENDING / CONFIRMED booking are kept
      // and still trigger the 409 guard below on insert.
      await this.deleteStaleSeatRows(dto.showtimeId, seatIds);

      const snapshots = seatMap.seats.map((s) =>
        this.bookingSeats.create({
          booking: saved,
          showtimeId: dto.showtimeId,
          seatId: s.id,
          rowLabel: s.rowLabel,
          seatNumber: s.number,
          category: s.category,
          priceAmount,
          priceCurrency: 'IDR',
        }),
      );
      await this.bookingSeats.save(snapshots);

      const externalId = this.payment.externalIdFor(saved.id);
      await this.payments.save(
        this.payments.create({
          booking: saved,
          externalId,
          amount: totalAmount,
          currency: 'IDR',
          status: 'PENDING',
          method: 'XENDIT',
          invoiceId: null,
          checkoutUrl: null,
        }),
      );

      getBookingMeters().holds.add(1, { status: 'held' });
      return {
        bookingId: saved.id,
        status: 'PENDING',
        expiresAt: expiresAt.toISOString(),
        totalAmount,
        currency: 'IDR',
        seats: seatMap.seats.map((s) => ({
          seatId: s.id,
          rowLabel: s.rowLabel,
          seatNumber: s.number,
          category: s.category,
          priceAmount,
          priceCurrency: 'IDR',
        })),
        payment: {
          externalId,
          method: 'XENDIT',
          status: 'PENDING',
          checkoutUrl: null,
          invoiceId: null,
        },
      };
    } catch (err) {
      if (savedBookingId) {
        this.activeLocks.delete(savedBookingId);
      }
      await handle.release();
      if (savedBookingId) {
        // Never leave an orphan PENDING booking behind: without its seat
        // snapshots it could still be invoiced by charge().
        try {
          await this.bookings.delete(savedBookingId);
        } catch {
          /* best-effort cleanup */
        }
      }
      if (this.isUniqueViolation(err)) {
        // Lock was free but a live PENDING / CONFIRMED booking still owns
        // one of these seats → hard DB guard (also covers the case where
        // Redis was flushed and the lock no longer reflects reality).
        getBookingMeters().holds.add(1, { status: 'conflict' });
        throw new RpcException(
          rpcErrorPayload(409, 'Some seats are already held or booked'),
        );
      }
      getBookingMeters().holds.add(1, { status: 'error' });
      throw err;
    }
  }

  /**
   * Delete seat rows for the given seats whose booking is dead
   * (CANCELLED / EXPIRED / REFUNDED / timed-out PENDING). Best-effort:
   * failures fall through and surface as a 409 / 500 on the snapshot insert.
   */
  private async deleteStaleSeatRows(
    showtimeId: string,
    seatIds: string[],
  ): Promise<void> {
    try {
      const stale = await this.bookingSeats.find({
        where: {
          showtimeId,
          seatId: In(seatIds),
          booking: [
            { status: 'CANCELLED' },
            { status: 'EXPIRED' },
            // A refunded row must be reclaimable, otherwise the seat it
            // still reserves can never be sold again.
            { status: 'REFUNDED' },
            { status: 'PENDING', expiresAt: LessThan(new Date()) },
          ],
        },
        select: { id: true },
      });
      if (stale.length > 0) {
        await this.bookingSeats.delete(stale.map((s) => s.id));
      }
    } catch {
      /* best-effort; the snapshot insert will surface real failures */
    }
  }

  private isRedisUnavailable(err: unknown): boolean {
    const msg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|MaxRetriesPerRequest|Connection is closed|redis/i.test(
      msg,
    );
  }

  async cancel(dto: BookingCancelRequest): Promise<BookingDto> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);

    // A paid booking is compensated, not simply dropped: request a refund
    // from the provider. This is the saga's compensating transaction for the
    // step that actually moved money.
    if (booking.status === 'CONFIRMED') {
      return this.refundConfirmed(booking);
    }

    if (booking.status !== 'PENDING') {
      throw new RpcException(
        rpcErrorPayload(
          409,
          `Cannot cancel a ${booking.status.toLowerCase().replace('_', ' ')} booking`,
        ),
      );
    }
    booking.status = 'CANCELLED';
    booking.cancellationReason = 'CUSTOMER';
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    // Best-effort: close the hosted invoice so it can't be paid late (a
    // late PAID webhook for a CANCELLED booking is rejected with 410).
    try {
      const payment = await this.payments.findOne({
        where: { booking: { id: booking.id } },
        order: { createdAt: 'DESC' },
      });
      if (payment?.invoiceId) {
        await this.payment.expireInvoice(payment.invoiceId);
      }
    } catch {
      /* best-effort */
    }
    return this.toBookingDto(await this.reload(booking.id));
  }

  /**
   * Saga compensation for a paid booking: ask the provider for a refund.
   *
   * Xendit settles refunds asynchronously, so the booking either becomes
   * REFUNDED (the provider already settled) or REFUND_PENDING, which
   * `reconcileRefunds` finishes. It is never marked REFUNDED on a mere
   * request — a failed refund must not look like returned money.
   */
  private async refundConfirmed(booking: Booking): Promise<BookingDto> {
    const payment = await this.payments.findOne({
      where: { booking: { id: booking.id }, status: 'PAID' },
      order: { createdAt: 'DESC' },
    });
    if (!payment?.invoiceId) {
      throw new RpcException(
        rpcErrorPayload(409, 'No paid payment to refund for this booking'),
      );
    }

    let refund: { refundId: string; status: string };
    try {
      refund = await this.payment.createRefundForPayment({
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        reason: 'CANCELLATION',
      });
    } catch (err) {
      // A provider failure must leave our state untouched: no money moved.
      if (err instanceof RpcException) throw err;
      throw new RpcException(
        rpcErrorPayload(502, 'Refund provider is unavailable, try again later'),
      );
    }

    payment.refundId = refund.refundId;
    if (refund.status === 'SUCCEEDED') {
      await this.settleRefund(booking, payment);
    } else {
      // The refund is in flight: keep the booking paid and its tickets valid
      // until the money is actually back (reconcileRefunds finishes it).
      payment.status = 'REFUND_PENDING';
      await this.payments.save(payment);
      booking.status = 'REFUND_PENDING';
      await this.bookings.save(booking);
    }

    return this.toBookingDto(await this.reload(booking.id));
  }

  /**
   * The provider returned the money: the booking is terminal as REFUNDED and
   * its tickets are voided so a refunded code can no longer be scanned.
   */
  private async settleRefund(
    booking: Booking,
    payment: Payment,
  ): Promise<void> {
    payment.status = 'REFUNDED';
    payment.refundedAt = new Date();
    await this.payments.save(payment);
    booking.status = 'REFUNDED';
    await this.bookings.save(booking);
    await this.deleteTicketsForBooking(booking.id);
  }

  /**
   * The provider refused the refund: the money never left the customer, so
   * the booking goes back to being paid and the tickets stay usable.
   */
  private async revertRefund(
    booking: Booking,
    payment: Payment,
  ): Promise<void> {
    payment.status = 'PAID';
    payment.refundId = null;
    await this.payments.save(payment);
    booking.status = 'CONFIRMED';
    await this.bookings.save(booking);
  }

  /**
   * Finish in-flight refunds. A REFUND_PENDING booking is finalised only when
   * the provider reports SUCCEEDED; a FAILED refund reverts the booking to
   * CONFIRMED, because the money never left the customer. Provider errors are
   * tolerated so one bad refund cannot stall the pass.
   */
  async reconcileRefunds(): Promise<{
    finalized: string[];
    reverted: string[];
  }> {
    const pending = await this.bookings.find({
      where: { status: 'REFUND_PENDING' },
    });
    const finalized: string[] = [];
    const reverted: string[] = [];

    for (const booking of pending) {
      const payment = await this.payments.findOne({
        where: { booking: { id: booking.id } },
        order: { createdAt: 'DESC' },
      });
      if (!payment?.refundId) continue;

      let status: string;
      try {
        status = (
          await this.payment.getRefundStatus(payment.refundId)
        ).toUpperCase();
      } catch {
        // Provider unreachable: leave it in flight for the next pass.
        continue;
      }

      if (status === 'SUCCEEDED') {
        await this.settleRefund(booking, payment);
        finalized.push(booking.id);
      } else if (status === 'FAILED') {
        await this.revertRefund(booking, payment);
        reverted.push(booking.id);
      }
    }

    return { finalized, reverted };
  }

  /** Void a booking's tickets so a refunded ticket can no longer be scanned. */
  private async deleteTicketsForBooking(bookingId: string): Promise<void> {
    try {
      const rows = await this.tickets.find({
        where: { booking: { id: bookingId } },
        select: { id: true },
      });
      if (rows.length > 0) {
        await this.tickets.delete(rows.map((t) => t.id));
      }
    } catch {
      /* best-effort: a settled refund must not be undone by cleanup failure */
    }
  }

  async get(dto: BookingGetRequest): Promise<BookingDto> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    return this.toBookingDto(await this.reload(booking.id));
  }

  async list(dto: BookingListRequest): Promise<PaginatedBookings> {
    const page = Math.max(1, Number(dto.page) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(dto.limit) || DEFAULT_LIMIT),
    );

    const [items, total] = await this.bookings.findAndCount({
      where: { userId: dto.userId },
      order: { createdAt: 'DESC' },
      relations: { seats: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((b) => this.toBookingDto(b)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Live seat availability for a showtime: HELD for seats under a live
   * (non-expired) PENDING hold, BOOKED for confirmed bookings. Seats with no
   * entry are AVAILABLE. Redlock TTL is the real gatekeeper; this only
   * informs the seat map UI.
   */
  async availability(
    dto: BookingAvailabilityRequest,
  ): Promise<BookingAvailabilityResponse> {
    const now = new Date();
    const bookings = await this.bookings.find({
      where: [
        { showtimeId: dto.showtimeId, status: 'CONFIRMED' },
        // A refund in flight still owns its seats until the money is back.
        { showtimeId: dto.showtimeId, status: 'REFUND_PENDING' },
        {
          showtimeId: dto.showtimeId,
          status: 'PENDING',
          expiresAt: MoreThan(now),
        },
      ],
      relations: { seats: true },
    });

    const occupied = new Map<string, 'HELD' | 'BOOKED'>();
    for (const booking of bookings) {
      // Defensive: a row that is neither live nor paid (e.g. REFUNDED) must
      // not occupy a seat, no matter what the caller handed us.
      let status: 'HELD' | 'BOOKED' | null = null;
      if (booking.status === 'PENDING') status = 'HELD';
      else if (
        booking.status === 'CONFIRMED' ||
        booking.status === 'REFUND_PENDING'
      ) {
        status = 'BOOKED';
      }
      if (!status) continue;
      for (const seat of booking.seats ?? []) {
        occupied.set(seat.seatId, status);
      }
    }

    return {
      showtimeId: dto.showtimeId,
      seats: [...occupied].map(([seatId, status]) => ({ seatId, status })),
    };
  }

  /** In-flight charge tasks per booking: concurrent charges for the same
   *  booking share one task so duplicate Xendit invoices are never created
   *  (an orphaned invoice could otherwise be paid with no booking to
   *  confirm it against). */
  private readonly chargeLocks = new Map<
    string,
    Promise<PaymentChargeResponse>
  >();

  /**
   * Create a Xendit hosted invoice for a PENDING booking.
   * Idempotent: re-charging a booking with a live invoice returns the
   * existing checkout URL instead of creating a duplicate.
   */
  async charge(dto: PaymentChargeRequest): Promise<PaymentChargeResponse> {
    const key = `${dto.userId || ''}:${dto.bookingId || ''}`;
    const pending = this.chargeLocks.get(key);
    if (pending) return pending;
    const task = this.chargeInner(dto).finally(() => {
      if (this.chargeLocks.get(key) === task) this.chargeLocks.delete(key);
    });
    this.chargeLocks.set(key, task);
    return task;
  }

  private async chargeInner(
    dto: PaymentChargeRequest,
  ): Promise<PaymentChargeResponse> {
    if (!dto.bookingId) {
      throw new RpcException(rpcErrorPayload(400, 'bookingId is required'));
    }
    const userId = dto.userId || '';
    const booking = await this.mustFindOwned(dto.bookingId, userId);
    if (booking.status === 'CONFIRMED') {
      throw new RpcException(rpcErrorPayload(409, 'Booking is already paid'));
    }
    if (booking.status !== 'PENDING') {
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }
    if (booking.expiresAt.getTime() <= Date.now()) {
      booking.status = 'EXPIRED';
      await this.bookings.save(booking);
      await this.releaseLocks(booking.id);
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }

    let payment = await this.payments.findOne({
      where: { booking: { id: booking.id } },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      payment = this.payments.create({
        booking,
        externalId: this.payment.externalIdFor(booking.id),
        amount: booking.totalAmount,
        currency: booking.currency,
        status: 'PENDING',
        method: 'XENDIT',
      });
      await this.payments.save(payment);
    }

    // Reuse a live invoice when one already exists for this booking.
    if (payment.invoiceId && payment.checkoutUrl) {
      try {
        const status = await this.payment.getInvoiceStatus(payment.invoiceId);
        if (status === 'PENDING') {
          return {
            externalId: payment.externalId,
            paid: false,
            providerTxnId: null,
            paidAt: null,
            receiptUrl: null,
            checkoutUrl: payment.checkoutUrl,
            invoiceId: payment.invoiceId,
            method: 'XENDIT',
          };
        }
      } catch {
        // fall through and create a fresh invoice
      }
    }

    let description = `CinX booking ${booking.id}`;
    try {
      const seatMap = await this.seatAvailability.getSeatMap(
        booking.showtimeId,
      );
      description = `CinX: ${seatMap.movieTitle} @ ${seatMap.theaterName}`;
    } catch {
      // description fallback is fine
    }

    const created = await withSpan(
      'payment.charge',
      () =>
        this.payment.createInvoiceForBooking({
          bookingId: booking.id,
          amount: booking.totalAmount,
          currency: booking.currency,
          description,
          expiresAt: booking.expiresAt,
          payerEmail: dto.payerEmail,
          returnUrl: dto.returnUrl,
        }),
      { 'booking.id': booking.id },
    );

    payment.invoiceId = created.invoiceId;
    payment.checkoutUrl = created.checkoutUrl;
    payment.externalId = created.externalId;
    payment.status = 'PENDING';
    await this.payments.save(payment);

    return {
      externalId: payment.externalId,
      paid: false,
      providerTxnId: null,
      paidAt: null,
      receiptUrl: null,
      checkoutUrl: created.checkoutUrl,
      invoiceId: created.invoiceId,
      method: 'XENDIT',
    };
  }

  /**
   * Xendit invoice callback. Verifies the `x-callback-token`, then applies
   * PAID/SETTLED → CONFIRMED + tickets, EXPIRED/FAILED → CANCELLED.
   * Idempotent: duplicate callbacks for a CONFIRMED booking return ok.
   */
  async webhook(dto: PaymentWebhookRequest): Promise<Empty> {
    // The gateway may use any of the alias field names (proto JSON mapping);
    // all carry the same verified callback token + raw JSON body.
    const signature =
      dto.signature ??
      dto.callbackToken ??
      dto.callback_token ??
      dto.xCallbackToken ??
      '';
    const rawBody = dto.body ?? dto.rawBody ?? dto.payload ?? '';
    this.payment.verifySignature(signature);
    const cb = this.payment.parseCallback(rawBody);
    const status = cb.status.toUpperCase();

    return withSpan(
      'payment.webhook',
      async (span) => {
        span.setAttribute('payment.status', status);
        const meters = getBookingMeters();

        const payment =
          (await this.payments.findOne({
            where: { invoiceId: cb.id },
            relations: { booking: true },
          })) ??
          (await this.payments.findOne({
            where: { externalId: cb.external_id },
            relations: { booking: true },
          }));
        if (!payment) {
          throw new RpcException(rpcErrorPayload(404, 'Payment not found'));
        }
        const booking = payment.booking as Booking | undefined;
        if (!booking) {
          throw new RpcException(rpcErrorPayload(404, 'Booking not found'));
        }
        span.setAttribute('booking.id', booking.id);
        const full = await this.bookings.findOne({
          where: { id: booking.id },
          relations: { seats: true },
        });
        if (!full) {
          throw new RpcException(rpcErrorPayload(404, 'Booking not found'));
        }

        if (
          status === 'PAID' ||
          status === 'SETTLED' ||
          status === 'CAPTURED'
        ) {
          if (full.status === 'CONFIRMED') {
            meters.webhooks.add(1, { status: 'paid' });
            return {};
          }
          // Same liveness guard as syncPaymentStatus(): an expired hold (TTL
          // lapsed or seats re-taken) must never issue tickets, even if
          // Xendit reports payment. Late money needs a refund, not tickets.
          await this.assertHoldLive(full);
          payment.status = 'PAID';
          // The invoice callback carries no separate settlement id, so
          // providerTxnId is deliberately left alone rather than being
          // filled with the invoice id (which already has its own column).
          payment.paidAt = cb.paid_at ? new Date(cb.paid_at) : new Date();
          payment.receiptUrl = null;
          await this.payments.save(payment);

          full.status = 'CONFIRMED';
          full.confirmedAt = new Date();
          await this.bookings.save(full);
          const issued = await this.ensureTickets(full);
          await this.releaseLocks(full.id);
          await this.notifyConfirmed(full, payment, issued);
          meters.webhooks.add(1, { status: 'paid' });
          meters.confirms.add(1, { status: 'confirmed' });
          return {};
        }

        if (
          status === 'EXPIRED' ||
          status === 'FAILED' ||
          status === 'CANCELLED'
        ) {
          if (full.status !== 'PENDING') {
            meters.webhooks.add(1, { status: 'expired' });
            return {};
          }
          payment.status = 'FAILED';
          await this.payments.save(payment);
          full.status = 'CANCELLED';
          full.cancellationReason = 'PAYMENT_DECLINED';
          await this.bookings.save(full);
          await this.releaseLocks(full.id);
          meters.webhooks.add(1, { status: 'expired' });
          return {};
        }

        // Unknown status (e.g. PENDING invoice creation callback) — acknowledge.
        meters.webhooks.add(1, { status: 'ignored' });
        return {};
      },
      { 'payment.status': status },
    );
  }

  async getTicketByCode(dto: TicketByCodeRequest): Promise<TicketLookupDto> {
    const ticket = await this.tickets.findOne({
      where: { code: dto.code },
      relations: { booking: true },
    });
    if (!ticket) {
      throw new RpcException(rpcErrorPayload(404, 'Ticket not found'));
    }
    const booking = ticket.booking as Booking | undefined;
    return {
      id: ticket.id,
      code: ticket.code,
      bookingId: booking?.id ?? '',
      showtimeId: booking?.showtimeId ?? '',
      movieTitle: ticket.movieTitle,
      theaterName: ticket.theaterName,
      startsAt: ticket.startsAt.toISOString(),
      seatId: ticket.seatId,
      row: ticket.rowLabel,
      number: ticket.seatNumber,
    };
  }

  /**
   * Server-side payment status sync: ask Xendit directly whether the booking's
   * invoice was paid (or expired), then apply the same state transitions and
   * guards as the webhook. This is the webhook-less confirmation path — used
   * when no callback URL is registered (local/dev) or when a callback was
   * missed. The invoice status comes from Xendit's API with the secret key,
   * so it cannot be forged by the client.
   */
  async syncPaymentStatus(dto: PaymentSyncRequest): Promise<BookingDto> {
    const booking = await this.mustFindOwned(dto.bookingId, dto.userId);
    if (booking.status !== 'PENDING') {
      // CONFIRMED/EXPIRED/CANCELLED are terminal here — nothing to sync.
      return this.toBookingDto(await this.reload(booking.id));
    }

    const payment = await this.payments.findOne({
      where: { booking: { id: booking.id } },
      order: { createdAt: 'DESC' },
    });
    if (!payment?.invoiceId) {
      throw new RpcException(
        rpcErrorPayload(409, 'No payment invoice exists for this booking'),
      );
    }

    let invoiceStatus: string;
    try {
      invoiceStatus = (
        await this.payment.getInvoiceStatus(payment.invoiceId)
      ).toUpperCase();
    } catch (err: unknown) {
      // Re-throw known RPC errors (e.g. 502 provider failure) as-is.
      if (err instanceof RpcException) throw err;
      throw new RpcException(
        rpcErrorPayload(
          502,
          'Payment provider is unavailable, try again later',
        ),
      );
    }

    return withSpan(
      'payment.sync',
      async (span) => {
        span.setAttribute('payment.invoice_status', invoiceStatus);
        const meters = getBookingMeters();

        if (
          invoiceStatus === 'PAID' ||
          invoiceStatus === 'SETTLED' ||
          invoiceStatus === 'CAPTURED'
        ) {
          // Same liveness guard as the webhook: expired hold → no tickets.
          await this.assertHoldLive(booking);
          payment.status = 'PAID';
          payment.paidAt = new Date();
          payment.receiptUrl = null;
          await this.payments.save(payment);

          booking.status = 'CONFIRMED';
          booking.confirmedAt = new Date();
          await this.bookings.save(booking);
          const issued = await this.ensureTickets(booking);
          await this.releaseLocks(booking.id);
          await this.notifyConfirmed(booking, payment, issued);
          meters.webhooks.add(1, { status: 'paid' });
          meters.confirms.add(1, { status: 'confirmed' });
          return this.toBookingDto(await this.reload(booking.id));
        }

        if (
          invoiceStatus === 'EXPIRED' ||
          invoiceStatus === 'FAILED' ||
          invoiceStatus === 'CANCELLED'
        ) {
          payment.status = 'FAILED';
          await this.payments.save(payment);
          booking.status = 'CANCELLED';
          booking.cancellationReason = 'PAYMENT_DECLINED';
          await this.bookings.save(booking);
          await this.releaseLocks(booking.id);
          meters.webhooks.add(1, { status: 'expired' });
          return this.toBookingDto(await this.reload(booking.id));
        }

        // Still PENDING (or any other transient status) — nothing to apply.
        meters.webhooks.add(1, { status: 'ignored' });
        return this.toBookingDto(await this.reload(booking.id));
      },
      { 'booking.id': booking.id },
    );
  }

  /**
   * Issue (or return) a confirmed Booking's tickets. This is the write path
   * and is idempotent; confirmation already calls it, so callers normally only
   * need `listTickets`.
   */
  async issueTickets(dto: BookingGetRequest): Promise<TicketList> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    if (booking.status !== 'CONFIRMED') {
      throw new RpcException(
        rpcErrorPayload(409, 'Tickets are only issued for confirmed bookings'),
      );
    }
    const created = await this.ensureTickets(booking);
    return { items: created.map((t) => this.toTicketDto(t)) };
  }

  /**
   * Read a Booking's tickets. Deliberately write-free: tickets come into
   * existence at confirmation, never as a side effect of reading a booking.
   */
  async listTickets(dto: BookingGetRequest): Promise<TicketList> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    const rows = await this.tickets.find({
      where: { booking: { id: booking.id } },
      relations: { booking: true },
      order: { createdAt: 'ASC' },
    });
    return { items: rows.map((t) => this.toTicketDto(t)) };
  }

  /** Expire stale PENDING bookings (belt-and-suspenders to the redlock TTL). */
  @Cron('*/1 * * * *')
  async reconcileCron(): Promise<void> {
    await this.expireStaleBookings();
    await this.reconcileRefunds();
  }

  async expireStaleBookings(): Promise<ReconcileResult> {
    const stale = await this.bookings.find({
      where: { status: 'PENDING', expiresAt: LessThan(new Date()) },
    });
    const expired: string[] = [];
    for (const b of stale) {
      b.status = 'EXPIRED';
      await this.bookings.save(b);
      expired.push(b.id);
      await this.releaseLocks(b.id);
      // Best-effort: close the hosted invoice so it can't be paid late.
      try {
        const payment = await this.payments.findOne({
          where: { booking: { id: b.id } },
          order: { createdAt: 'DESC' },
        });
        if (payment?.invoiceId) {
          await this.payment.expireInvoice(payment.invoiceId);
        }
      } catch {
        /* best-effort */
      }
    }
    return { expired, count: expired.length };
  }

  /**
   * Shared liveness guard for confirm() and webhook(): the booking must be
   * PENDING, unexpired, and its Redis seat locks must still be held.
   * On failure the booking is marked EXPIRED and 410 is thrown.
   */
  private async assertHoldLive(booking: Booking): Promise<void> {
    if (booking.status !== 'PENDING') {
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }
    if (booking.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(booking);
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }
    const handle = this.activeLocks.get(booking.id);
    if (handle) {
      try {
        await handle.extend(HOLD_TTL_MS);
        return;
      } catch {
        await this.markExpired(booking);
        throw new RpcException(
          rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
        );
      }
    }
    // No in-memory handle (hold was taken on another replica, or this
    // instance restarted): verify the seat locks directly in Redis. Fail
    // closed when Redis itself is unreachable — never confirm blind.
    let keys: string[];
    try {
      const seats = await this.bookingSeats.find({
        where: { booking: { id: booking.id } },
        select: { seatId: true },
      });
      keys = seats.map((s) =>
        this.seatLock.lockKey(booking.showtimeId, s.seatId),
      );
    } catch {
      throw new RpcException(
        rpcErrorPayload(503, 'Seat lock unavailable, please retry'),
      );
    }
    if (keys.length === 0) {
      await this.markExpired(booking);
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }
    try {
      const existing = await this.redis.exists(...keys);
      if (existing !== keys.length) {
        await this.markExpired(booking);
        throw new RpcException(
          rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
        );
      }
    } catch (err) {
      if (err instanceof RpcException) throw err;
      throw new RpcException(
        rpcErrorPayload(503, 'Seat lock unavailable, please retry'),
      );
    }
  }

  private async markExpired(booking: Booking): Promise<void> {
    booking.status = 'EXPIRED';
    try {
      await this.bookings.save(booking);
    } catch {
      /* best-effort */
    }
    await this.releaseLocks(booking.id);
  }

  private async ensureTickets(booking: Booking): Promise<Ticket[]> {
    const existing = await this.tickets.find({
      where: { booking: { id: booking.id } },
    });
    if (existing.length > 0) {
      return existing;
    }

    const seatMap = await this.seatAvailability.getSeatMap(booking.showtimeId);
    const seats = await this.bookingSeats.find({
      where: { booking: { id: booking.id } },
    });

    const created = seats.map((s) =>
      this.tickets.create({
        booking: { id: booking.id } as Booking,
        code: generateTicketCode(),
        movieTitle: seatMap.movieTitle,
        theaterName: seatMap.theaterName,
        startsAt: new Date(seatMap.startsAt),
        seatId: s.seatId,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
      }),
    );
    try {
      return await this.tickets.save(created);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        // Concurrent confirm/webhook duplicate: the other writer already
        // issued this booking's tickets — return those instead of failing.
        const existing = await this.tickets.find({
          where: { booking: { id: booking.id } },
        });
        if (existing.length > 0) return existing;
      }
      throw err;
    }
  }

  /**
   * Fan out the customer emails for a settled Booking: the tickets and the
   * receipt. Best-effort by contract — a Booking that is already paid for
   * must never fail (or be rolled back) because the broker, the directory or
   * the mailer is unavailable.
   */
  private async notifyConfirmed(
    booking: Booking,
    payment: Payment | null,
    tickets: Ticket[],
  ): Promise<void> {
    try {
      const [contact, seatMap] = await Promise.all([
        this.customers.contactFor(booking.userId),
        this.seatAvailability.getSeatMap(booking.showtimeId),
      ]);
      if (!contact) return;

      const recipient = { to: contact.email, name: contact.name ?? null };
      const where = {
        movieTitle: seatMap.movieTitle,
        theaterName: seatMap.theaterName,
        startsAt: seatMap.startsAt,
      };

      await this.events.bookingConfirmed({
        recipient,
        bookingId: booking.id,
        totalAmount: booking.totalAmount,
        currency: 'IDR',
        ...where,
        seats: (booking.seats ?? []).map((s) => ({
          seatId: s.seatId,
          rowLabel: s.rowLabel,
          seatNumber: s.seatNumber,
          category: s.category,
          priceAmount: s.priceAmount,
        })),
        tickets: tickets.map((t) => ({
          code: t.code,
          seatId: t.seatId,
          rowLabel: t.rowLabel,
          seatNumber: t.seatNumber,
        })),
        confirmedAt: (booking.confirmedAt ?? new Date()).toISOString(),
      });

      if (payment) {
        await this.events.paymentReceived({
          recipient,
          bookingId: booking.id,
          amount: payment.amount,
          currency: 'IDR',
          externalId: payment.externalId,
          providerTxnId: payment.providerTxnId ?? null,
          paidAt: (payment.paidAt ?? new Date()).toISOString(),
          method: payment.method,
          receiptUrl: payment.receiptUrl ?? null,
          ...where,
        });
      }
    } catch (err) {
      this.logger.warn(
        `confirmation events for booking ${booking.id} were not published: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    );
  }

  private async mustFindOwned(id: string, userId: string): Promise<Booking> {
    const booking = await this.bookings.findOne({
      where: { id },
      relations: { seats: true },
    });
    if (!booking || booking.userId !== userId) {
      throw new RpcException(rpcErrorPayload(404, 'Booking not found'));
    }
    return booking;
  }

  private async reload(id: string): Promise<Booking> {
    return this.bookings.findOneOrFail({
      where: { id },
      relations: { seats: true },
    });
  }

  private async releaseLocks(bookingId: string): Promise<void> {
    const handle = this.activeLocks.get(bookingId);
    if (handle) {
      this.activeLocks.delete(bookingId);
      await handle.release();
    }
  }

  private toBookingDto(booking: Booking): BookingDto {
    return {
      id: booking.id,
      userId: booking.userId,
      showtimeId: booking.showtimeId,
      totalAmount: booking.totalAmount,
      currency: booking.currency as 'IDR',
      status: booking.status,
      cancellationReason: booking.cancellationReason ?? null,
      expiresAt: booking.expiresAt.toISOString(),
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      seats: (booking.seats ?? []).map((s) => ({
        seatId: s.seatId,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        category: s.category,
        priceAmount: s.priceAmount,
        priceCurrency: s.priceCurrency as 'IDR',
      })),
    };
  }

  private toTicketDto(ticket: Ticket): TicketDto {
    return {
      id: ticket.id,
      bookingId: (ticket.booking as Booking | undefined)?.id ?? '',
      code: ticket.code,
      movieTitle: ticket.movieTitle,
      theaterName: ticket.theaterName,
      startsAt: ticket.startsAt.toISOString(),
      seatId: ticket.seatId,
      row: ticket.rowLabel,
      number: ticket.seatNumber,
      createdAt: ticket.createdAt.toISOString(),
    };
  }
}
