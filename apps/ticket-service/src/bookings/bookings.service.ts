import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCancelRequest,
  BookingDto,
  BookingGetRequest,
  BookingListRequest,
  HoldResponse,
  HoldSeatsRequest,
  MockSimulation,
  PaginatedBookings,
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentConfirmRequest,
  ReconcileResult,
  rpcErrorPayload,
  TicketByCodeRequest,
  TicketDto,
  TicketLookupDto,
} from '@ticketing/shared';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { LockHandle, SeatLockService } from '../lock/lock.module';
import { MockPaymentService } from '../payments/mock-payment.service';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';
import { generateTicketCode } from './ticket-code';

const HOLD_TTL_MS = 5 * 60_000; // must match the redlock TTL in hold
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Bookings flow: hold (redlock multi-seat lock + PENDING booking) →
 * payment.confirm (re-check/extend lock, CONFIRMED + tickets, or
 * CANCELLED on payment failure) → cancel/expire release locks.
 *
 * Redis is the concurrency layer; the UNIQUE (showtime_id, seat_id) index
 * on booking_seats is the hard double-booking guard.
 */
@Injectable()
export class BookingsService {
  /** Active redlock handles keyed by booking id, so confirm/cancel can
   *  extend/release early instead of waiting for the TTL. */
  private readonly activeLocks = new Map<string, LockHandle>();

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
    private readonly mockPayment: MockPaymentService,
  ) {}

  async hold(dto: HoldSeatsRequest): Promise<HoldResponse> {
    if (dto.seatIds.length === 0) {
      throw new RpcException(
        rpcErrorPayload(400, 'At least one seat is required'),
      );
    }
    const seatIds = [...new Set(dto.seatIds)];

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
      handle = await this.seatLock.hold(keys, HOLD_TTL_MS);
    } catch {
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

      const providerId = this.mockPayment.newProviderId();
      await this.payments.save(
        this.payments.create({
          booking: saved,
          providerId,
          amount: totalAmount,
          currency: 'IDR',
          status: 'PENDING',
        }),
      );

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
        payment: { providerId, method: 'MOCK', status: 'PENDING' },
      };
    } catch (err) {
      if (savedBookingId) {
        this.activeLocks.delete(savedBookingId);
      }
      await handle.release();
      if (this.isUniqueViolation(err)) {
        // Lock was free but the seats were already confirmed → hard DB guard.
        throw new RpcException(
          rpcErrorPayload(409, 'Some seats are already held or booked'),
        );
      }
      throw err;
    }
  }

  async cancel(dto: BookingCancelRequest): Promise<BookingDto> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    if (booking.status !== 'PENDING') {
      throw new RpcException(
        rpcErrorPayload(
          409,
          `Cannot cancel a ${booking.status.toLowerCase()} booking`,
        ),
      );
    }
    booking.status = 'CANCELLED';
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    return this.toBookingDto(await this.reload(booking.id));
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
      const status = booking.status === 'CONFIRMED' ? 'BOOKED' : 'HELD';
      for (const seat of booking.seats ?? []) {
        occupied.set(seat.seatId, status);
      }
    }

    return {
      showtimeId: dto.showtimeId,
      seats: [...occupied].map(([seatId, status]) => ({ seatId, status })),
    };
  }

  /** Simulated payment-gateway charge (delay + configurable outcome). */
  async charge(dto: PaymentChargeRequest): Promise<PaymentChargeResponse> {
    const result = await this.mockPayment.charge(
      dto.simulate as MockSimulation,
    );
    return {
      providerId: result.providerId,
      paid: result.paid,
      providerTxnId: result.providerTxnId,
      paidAt: result.paidAt,
      receiptUrl: result.receiptUrl,
    };
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

  async confirm(dto: PaymentConfirmRequest): Promise<BookingDto> {
    const booking = await this.mustFindOwned(dto.bookingId, dto.userId);

    if (booking.status === 'CONFIRMED') {
      return this.toBookingDto(await this.reload(booking.id));
    }
    if (booking.status !== 'PENDING') {
      throw new RpcException(
        rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
      );
    }

    // Re-check/extend the lock: if the TTL lapsed and someone else took the
    // seats, the hold is gone and the booking cannot be confirmed.
    const handle = this.activeLocks.get(booking.id);
    if (handle) {
      try {
        await handle.extend(HOLD_TTL_MS);
      } catch {
        booking.status = 'EXPIRED';
        await this.bookings.save(booking);
        this.activeLocks.delete(booking.id);
        throw new RpcException(
          rpcErrorPayload(410, 'Booking expired and can no longer be paid'),
        );
      }
    }

    const payment = await this.payments.findOne({
      where: { booking: { id: booking.id }, status: 'PENDING' },
    });
    if (payment) {
      payment.status = dto.paid ? 'PAID' : 'FAILED';
      payment.providerTxnId = dto.providerId ?? payment.providerId;
      payment.paidAt =
        dto.paidAt != null
          ? new Date(dto.paidAt)
          : dto.paid
            ? new Date()
            : null;
      payment.receiptUrl = dto.receipt ?? null;
      await this.payments.save(payment);
    }

    if (dto.paid) {
      booking.status = 'CONFIRMED';
      booking.confirmedAt = new Date();
      await this.bookings.save(booking);
      await this.ensureTickets(booking);
      await this.releaseLocks(booking.id);
      return this.toBookingDto(await this.reload(booking.id));
    }

    booking.status = 'CANCELLED';
    await this.bookings.save(booking);
    await this.releaseLocks(booking.id);
    return this.toBookingDto(await this.reload(booking.id));
  }

  async createTickets(dto: BookingGetRequest): Promise<TicketDto[]> {
    const booking = await this.mustFindOwned(dto.id, dto.userId);
    if (booking.status !== 'CONFIRMED') {
      throw new RpcException(
        rpcErrorPayload(409, 'Tickets are only issued for confirmed bookings'),
      );
    }
    const created = await this.ensureTickets(booking);
    return created.map((t) => this.toTicketDto(t));
  }

  /** Expire stale PENDING bookings (belt-and-suspenders to the redlock TTL). */
  @Cron('*/1 * * * *')
  async reconcileCron(): Promise<void> {
    await this.expireStaleBookings();
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
    }
    return { expired, count: expired.length };
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
    return this.tickets.save(created);
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
      createdAt: ticket.createdAt.toISOString(),
    };
  }
}
