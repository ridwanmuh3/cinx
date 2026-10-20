import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import type Redis from 'ioredis';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCancelRequest,
  BookingConfirmedData,
  BookingDto,
  BookingGetRequest,
  BookingListRequest,
  ChargeContext,
  externalIdForBooking,
  getBookingMeters,
  HoldResponse,
  HoldSeatsRequest,
  PaginatedBookings,
  PaymentFailedData,
  PaymentRefundFailedData,
  PaymentRefundPendingData,
  PaymentRefundedData,
  PaymentSettledData,
  ReconcileResult,
  rpcErrorPayload,
  TicketsIssuedData,
  withSpan,
} from '@ticketing/shared';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { BookingEventsPublisher } from '../events/booking-events.publisher';
import { LockHandle, REDIS_CLIENT, SeatLockService } from '../lock/lock.module';
import { CustomerDirectoryService } from '../user/customer-directory.service';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';

const HOLD_TTL_MS = 5 * 60_000; // must match the redlock TTL in hold
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEATS_PER_HOLD = 8;
const RETRY_INTERVAL_MS = 30_000;

/**
 * Booking-service owns the saga state for a purchase:
 *
 *   hold (Redis locks + PENDING booking) → gateway calls payment-service →
 *   payment.settled (paidAt set, still PENDING) → booking.confirmed →
 *   ticket-service → tickets.issued → CONFIRMED.
 *
 * The service never calls payment-service or ticket-service synchronously.
 * Redis remains the concurrency layer; UNIQUE (showtime_id, seat_id) on
 * booking_seats is the hard double-booking guard.
 */
@Injectable()
export class BookingsService {
  /** Active redlock handles keyed by booking id. */
  private readonly activeLocks = new Map<string, LockHandle>();
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    @InjectRepository(BookingSeat)
    private readonly bookingSeats: Repository<BookingSeat>,
    private readonly seatAvailability: SeatAvailabilityService,
    private readonly seatLock: SeatLockService,
    private readonly events: BookingEventsPublisher,
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
      movieTitle: seatMap.seatMap.movieTitle,
      theaterName: seatMap.seatMap.theaterName,
      startsAt: new Date(seatMap.seatMap.startsAt),
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
        // payment-service creates the real record on Charge. This summary
        // keeps the pre-payment REST shape stable.
        payment: {
          externalId: externalIdForBooking(saved.id),
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
        // snapshots it could still be charged.
        try {
          await this.bookings.delete(savedBookingId);
        } catch {
          /* best-effort cleanup */
        }
      }
      if (this.isUniqueViolation(err)) {
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
   * (CANCELLED / EXPIRED / REFUNDED / timed-out unpaid PENDING). Best-effort:
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
            {
              status: 'PENDING',
              paidAt: IsNull(),
              expiresAt: LessThan(new Date()),
            },
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

    if (booking.status === 'REFUND_PENDING' || booking.status === 'REFUNDED') {
      throw new RpcException(
        rpcErrorPayload(409, 'Refund is already in progress'),
      );
    }
    if (booking.status === 'EXPIRED' || booking.status === 'CANCELLED') {
      throw new RpcException(
        rpcErrorPayload(
          409,
          `Cannot cancel a ${booking.status.toLowerCase()} booking`,
        ),
      );
    }

    // A paid booking is compensated, not simply dropped. The money is
    // refunded by payment-service after it consumes booking.refund.requested.
    if (booking.status === 'CONFIRMED' || booking.paidAt) {
      booking.status = 'REFUND_PENDING';
      booking.refundRequestedAt = new Date();
      await this.bookings.save(booking);
      await this.releaseLocks(booking.id);
      await this.events.refundRequested({
        bookingId: booking.id,
        userId: booking.userId,
        amount: booking.totalAmount,
        currency: 'IDR',
        reason: 'CUSTOMER',
      });
      return this.toBookingDto(await this.reload(booking.id));
    }

    booking.status = 'CANCELLED';
    booking.cancellationReason = 'CUSTOMER';
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    // payment-service consumes this and expires the hosted invoice, so a
    // late payment cannot settle against a cancelled booking.
    await this.events.cancelled({
      bookingId: booking.id,
      userId: booking.userId,
      reason: 'CUSTOMER',
    });
    return this.toBookingDto(await this.reload(booking.id));
  }

  async get(dto: BookingGetRequest): Promise<BookingDto> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    return this.toBookingDto(booking);
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
   * Live seat availability: HELD for an unpaid live hold, BOOKED for a paid
   * hold, confirmed booking, or refund in flight. A paid-but-unticketed
   * booking already owns its seats and must not look free.
   */
  async availability(
    dto: BookingAvailabilityRequest,
  ): Promise<BookingAvailabilityResponse> {
    const now = new Date();
    const bookings = await this.bookings.find({
      where: [
        { showtimeId: dto.showtimeId, status: 'CONFIRMED' },
        { showtimeId: dto.showtimeId, status: 'REFUND_PENDING' },
        { showtimeId: dto.showtimeId, status: 'PENDING' },
      ],
      relations: { seats: true },
    });

    const occupied = new Map<string, 'HELD' | 'BOOKED'>();
    for (const booking of bookings) {
      let status: 'HELD' | 'BOOKED' | null = null;
      if (
        booking.status === 'CONFIRMED' ||
        booking.status === 'REFUND_PENDING'
      ) {
        status = 'BOOKED';
      } else if (booking.status === 'PENDING') {
        if (booking.paidAt) status = 'BOOKED';
        else if (booking.expiresAt.getTime() > now.getTime()) status = 'HELD';
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

  /**
   * Read-only pre-flight check used by the gateway before it calls
   * payment-service. It never creates a payment record and never calls
   * another domain service.
   */
  async prepareCharge(dto: BookingGetRequest): Promise<ChargeContext> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    if (booking.status === 'CONFIRMED') {
      throw new RpcException(rpcErrorPayload(409, 'Booking is already paid'));
    }
    if (booking.status !== 'PENDING') {
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }
    if (booking.paidAt) {
      throw new RpcException(
        rpcErrorPayload(409, 'Payment is already settled for this booking'),
      );
    }
    if (booking.expiresAt.getTime() <= Date.now()) {
      await this.expireBooking(booking);
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }
    if (!(await this.hasLiveSeatLocks(booking))) {
      await this.expireBooking(booking);
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }

    return {
      bookingId: booking.id,
      userId: booking.userId,
      amount: booking.totalAmount,
      currency: 'IDR',
      expiresAt: booking.expiresAt.toISOString(),
      description: `CinX: ${booking.movieTitle} @ ${booking.theaterName}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Event appliers. Delivery is at-least-once; every handler is idempotent.
  // ---------------------------------------------------------------------------

  async onPaymentSettled(data: PaymentSettledData): Promise<void> {
    const booking = await this.findById(data.bookingId);
    if (!booking) {
      this.logger.warn(
        `payment.settled for unknown booking ${data.bookingId}; ignoring`,
      );
      return;
    }

    if (booking.status === 'PENDING' && !booking.paidAt) {
      const live = await this.isHoldLive(booking);
      if (!live) {
        // Late money against an expired hold: never issue tickets. Keep the
        // booking EXPIRED (its seats may already belong to someone else) and
        // ask payment-service for a refund.
        await this.expireBooking(booking);
        await this.requestLatePaymentRefund(booking, data.amount);
        return;
      }

      booking.paidAt = new Date(data.paidAt);
      booking.confirmationAttemptedAt = new Date();
      await this.bookings.save(booking);
      await this.releaseLocks(booking.id);
      await this.events.confirmed(await this.confirmedPayload(booking));
      await this.publishReceipt(booking, data);
      getBookingMeters().confirms.add(1, { status: 'confirmed' });
      return;
    }

    if (booking.status === 'PENDING' && booking.paidAt) {
      // Duplicate settlement. Ticket issuance may still be missing after a
      // broker outage, so re-emit the confirmed event (idempotent there).
      await this.events.confirmed(await this.confirmedPayload(booking));
      return;
    }

    if (booking.status === 'REFUND_PENDING' || booking.status === 'REFUNDED') {
      // Refund already underway; payment-service is idempotent.
      await this.events.refundRequested({
        bookingId: booking.id,
        userId: booking.userId,
        amount: data.amount,
        currency: 'IDR',
        reason: 'LATE_PAYMENT',
      });
      return;
    }

    if (booking.status === 'EXPIRED' || booking.status === 'CANCELLED') {
      await this.requestLatePaymentRefund(booking, data.amount);
    }
    // CONFIRMED: duplicate settlement, nothing to do.
  }

  async onPaymentFailed(data: PaymentFailedData): Promise<void> {
    const booking = await this.findById(data.bookingId);
    if (!booking) return;
    if (booking.status !== 'PENDING' || booking.paidAt) {
      // A failed invoice must not undo an already-paid booking.
      return;
    }
    booking.status = 'CANCELLED';
    booking.cancellationReason = 'PAYMENT_DECLINED';
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    await this.events.cancelled({
      bookingId: booking.id,
      userId: booking.userId,
      reason: 'PAYMENT_DECLINED',
    });
  }

  async onRefundPending(data: PaymentRefundPendingData): Promise<void> {
    const booking = await this.findById(data.bookingId);
    if (!booking || booking.status === 'REFUNDED') return;
    // Only a paid booking that still owns its seats may show REFUND_PENDING.
    // A late payment on an EXPIRED/CANCELLED booking stays terminal.
    if (booking.status === 'REFUND_PENDING' && booking.refundRequestedAt) {
      return;
    }
    if (!booking.paidAt) return;
    booking.status = 'REFUND_PENDING';
    booking.refundRequestedAt ??= new Date();
    await this.bookings.save(booking);
  }

  async onRefunded(data: PaymentRefundedData): Promise<void> {
    const booking = await this.findById(data.bookingId);
    if (!booking) return;
    if (booking.status === 'REFUNDED') {
      // Re-emit so a late-issued ticket is voided.
      await this.events.refunded({
        bookingId: booking.id,
        userId: booking.userId,
      });
      return;
    }
    booking.status = 'REFUNDED';
    booking.refundRequestedAt ??= new Date(data.refundedAt);
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    await this.events.refunded({
      bookingId: booking.id,
      userId: booking.userId,
    });
  }

  async onRefundFailed(data: PaymentRefundFailedData): Promise<void> {
    const booking = await this.findById(data.bookingId);
    if (!booking || booking.status !== 'REFUND_PENDING') return;

    // A refused refund means the money never left the customer. If tickets
    // were issued, the booking is simply paid again; if not, retry issuance.
    if (booking.ticketsIssuedAt || booking.confirmedAt) {
      booking.status = 'CONFIRMED';
      booking.refundRequestedAt = null;
      await this.bookings.save(booking);
      return;
    }
    if (booking.paidAt) {
      booking.status = 'PENDING';
      booking.refundRequestedAt = null;
      booking.confirmationAttemptedAt = new Date();
      await this.bookings.save(booking);
      await this.events.confirmed(await this.confirmedPayload(booking));
      return;
    }

    // Money was never confirmed as paid and the refund failed: leave the
    // booking terminal rather than pretending it is paid.
    booking.status = 'CANCELLED';
    booking.cancellationReason = 'PAYMENT_DECLINED';
    booking.refundRequestedAt = null;
    await this.bookings.save(booking);
  }

  async onTicketsIssued(data: TicketsIssuedData): Promise<void> {
    const booking = await this.findById(data.bookingId);
    if (!booking) return;

    if (booking.status === 'PENDING' || booking.status === 'CONFIRMED') {
      if (booking.status === 'PENDING' && !booking.paidAt) {
        // Tickets for an unpaid booking are not a valid state; ignore.
        return;
      }
      booking.status = 'CONFIRMED';
      booking.confirmedAt ??= new Date(data.confirmedAt);
      booking.ticketsIssuedAt = new Date();
      await this.bookings.save(booking);
      return;
    }

    // Tickets raced with a cancellation/refund. Re-emit the terminal event so
    // ticket-service voids them (its handlers are idempotent).
    if (booking.status === 'REFUNDED') {
      await this.events.refunded({
        bookingId: booking.id,
        userId: booking.userId,
      });
    } else if (booking.status === 'CANCELLED') {
      await this.events.cancelled({
        bookingId: booking.id,
        userId: booking.userId,
        reason: booking.cancellationReason ?? 'CUSTOMER',
      });
    } else if (booking.status === 'EXPIRED') {
      await this.events.expired({
        bookingId: booking.id,
        userId: booking.userId,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  @Cron('*/1 * * * *')
  async reconcileCron(): Promise<void> {
    await this.expireStaleBookings();
    await this.retryConfirmations();
    await this.retryRefunds();
  }

  /** Belt-and-suspenders to the redlock TTL. */
  async expireStaleBookings(): Promise<ReconcileResult> {
    const stale = await this.bookings.find({
      where: {
        status: 'PENDING',
        paidAt: IsNull(),
        expiresAt: LessThan(new Date()),
      },
    });
    const expired: string[] = [];
    for (const booking of stale) {
      await this.expireBooking(booking);
      expired.push(booking.id);
    }
    return { expired, count: expired.length };
  }

  /**
   * Paid but unticketed is a legitimate temporary state: the payment event
   * may have been consumed while ticket-service was down. Retry the
   * idempotent `booking.confirmed` event until `tickets.issued` arrives.
   */
  async retryConfirmations(): Promise<string[]> {
    const cutoff = new Date(Date.now() - RETRY_INTERVAL_MS);
    const candidates = await this.bookings
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.seats', 'seat')
      .where('booking.status = :status', { status: 'PENDING' })
      .andWhere('booking.paid_at IS NOT NULL')
      .andWhere('booking.tickets_issued_at IS NULL')
      .andWhere(
        '(booking.confirmation_attempted_at IS NULL OR booking.confirmation_attempted_at < :cutoff)',
        { cutoff },
      )
      .getMany();

    const retried: string[] = [];
    for (const booking of candidates) {
      booking.confirmationAttemptedAt = new Date();
      await this.bookings.save(booking);
      await this.events.confirmed(await this.confirmedPayload(booking));
      retried.push(booking.id);
    }
    return retried;
  }

  /** Re-ask payment-service for refunds whose first event was lost. */
  async retryRefunds(): Promise<string[]> {
    const cutoff = new Date(Date.now() - RETRY_INTERVAL_MS);
    const candidates = await this.bookings
      .createQueryBuilder('booking')
      .where('booking.status = :status', { status: 'REFUND_PENDING' })
      .andWhere(
        '(booking.refund_requested_at IS NULL OR booking.refund_requested_at < :cutoff)',
        { cutoff },
      )
      .getMany();

    const retried: string[] = [];
    for (const booking of candidates) {
      booking.refundRequestedAt = new Date();
      await this.bookings.save(booking);
      await this.events.refundRequested({
        bookingId: booking.id,
        userId: booking.userId,
        amount: booking.totalAmount,
        currency: 'IDR',
        reason: 'CUSTOMER',
      });
      retried.push(booking.id);
    }
    return retried;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async requestLatePaymentRefund(
    booking: Booking,
    amount: number,
  ): Promise<void> {
    await this.events.refundRequested({
      bookingId: booking.id,
      userId: booking.userId,
      amount,
      currency: 'IDR',
      reason: 'LATE_PAYMENT',
    });
  }

  private async expireBooking(booking: Booking): Promise<void> {
    if (booking.status !== 'PENDING') return;
    booking.status = 'EXPIRED';
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    await this.events.expired({
      bookingId: booking.id,
      userId: booking.userId,
    });
    getBookingMeters().confirms.add(1, { status: 'expired' });
  }

  /**
   * The hold is live only while PENDING, unexpired, and its Redis seat locks
   * still exist. A missing in-memory handle (another replica or a restart)
   * checks Redis directly. Redis being unreachable throws so the event is
   * requeued rather than confirming blind.
   */
  private async isHoldLive(booking: Booking): Promise<boolean> {
    if (booking.status !== 'PENDING' || booking.paidAt) return false;
    if (booking.expiresAt.getTime() <= Date.now()) return false;

    const handle = this.activeLocks.get(booking.id);
    if (handle) {
      try {
        await handle.extend(HOLD_TTL_MS);
        return true;
      } catch {
        return false;
      }
    }

    return this.hasLiveSeatLocks(booking);
  }

  private async hasLiveSeatLocks(booking: Booking): Promise<boolean> {
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
    if (keys.length === 0) return false;
    try {
      const existing = await this.redis.exists(...keys);
      return existing === keys.length;
    } catch (err) {
      if (err instanceof RpcException) throw err;
      throw new RpcException(
        rpcErrorPayload(503, 'Seat lock unavailable, please retry'),
      );
    }
  }

  private async confirmedPayload(
    booking: Booking,
  ): Promise<BookingConfirmedData> {
    const contact = await this.customers.contactFor(booking.userId);
    return {
      recipient: contact
        ? { to: contact.email, name: contact.name ?? null }
        : null,
      bookingId: booking.id,
      userId: booking.userId,
      showtimeId: booking.showtimeId,
      totalAmount: booking.totalAmount,
      currency: 'IDR' as const,
      movieTitle: booking.movieTitle,
      theaterName: booking.theaterName,
      startsAt: booking.startsAt.toISOString(),
      seats: (booking.seats ?? []).map((s) => ({
        seatId: s.seatId,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        category: s.category,
        priceAmount: s.priceAmount,
        priceCurrency: s.priceCurrency as 'IDR',
      })),
      confirmedAt: (booking.paidAt ?? new Date()).toISOString(),
    };
  }

  private async publishReceipt(
    booking: Booking,
    data: PaymentSettledData,
  ): Promise<void> {
    const contact = await this.customers.contactFor(booking.userId);
    if (!contact) return;
    await this.events.paymentReceived({
      recipient: { to: contact.email, name: contact.name ?? null },
      bookingId: booking.id,
      amount: data.amount,
      currency: 'IDR',
      externalId: data.externalId,
      providerTxnId: data.providerTxnId,
      paidAt: data.paidAt,
      method: data.method,
      receiptUrl: data.receiptUrl,
      movieTitle: booking.movieTitle,
      theaterName: booking.theaterName,
      startsAt: booking.startsAt.toISOString(),
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    );
  }

  private async findById(id: string): Promise<Booking | null> {
    return this.bookings.findOne({
      where: { id },
      relations: { seats: true },
    });
  }

  private async mustFindOwned(id: string, userId: string): Promise<Booking> {
    const booking = await this.findById(id);
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
}
