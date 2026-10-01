import { mock, MockProxy } from 'jest-mock-extended';
import { DeepPartial, Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { HoldSeatsRequest, ShowtimeSeatMap } from '@ticketing/shared';
import { BookingsService } from './bookings.service';
import { Booking } from './booking.entity';
import { BookingSeat } from './booking-seat.entity';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { BookingEventPublisher } from '../events/booking-event.publisher';
import { LockHandle, SeatLockService } from '../lock/lock.module';
import { PaymentService } from '../payments/payment.service';
import { CustomerDirectoryService } from '../user/customer-directory.service';

const HOLD_TTL_MS = 5 * 60_000;

const seatMap: ShowtimeSeatMap = {
  showtimeId: 'st1',
  movieId: 'm1',
  movieTitle: 'The Grand Adventure',
  posterUrl: null,
  ageRating: '13+',
  durationMinutes: 128,
  theaterId: 't1',
  theaterName: 'Grand Cineplex 1',
  startsAt: '2026-08-20T18:00:00.000Z',
  price: { amount: 50000, currency: 'IDR' },
  seats: [
    {
      id: 'seat1',
      rowLabel: 'A',
      number: 1,
      category: 'REGULAR',
      isAccessible: false,
      isDisabled: false,
    },
    {
      id: 'seat2',
      rowLabel: 'A',
      number: 2,
      category: 'REGULAR',
      isAccessible: false,
      isDisabled: false,
    },
  ],
};

function makeBooking(overrides?: Partial<Booking>): Booking {
  return {
    id: 'b1',
    userId: 'u1',
    showtimeId: 'st1',
    totalAmount: 100000,
    currency: 'IDR',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + HOLD_TTL_MS),
    confirmedAt: null,
    seats: [],
    payments: [],
    tickets: [],
    createdAt: new Date('2026-08-20T10:00:00Z'),
    updatedAt: new Date('2026-08-20T10:00:00Z'),
    ...overrides,
  } as Booking;
}

function makeHandle(): MockProxy<LockHandle> {
  return mock<LockHandle>();
}

async function expectStatus(
  promise: Promise<unknown>,
  statusCode: number,
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const payload = err instanceof RpcException ? err.getError() : err;
    const code = (payload as { statusCode?: number } | null)?.statusCode;
    expect(code).toBe(statusCode);
    return;
  }
  throw new Error('expected the promise to reject');
}

describe('BookingsService', () => {
  const bookings = mock<Repository<Booking>>();
  const bookingSeats = mock<Repository<BookingSeat>>();
  const payments = mock<Repository<Payment>>();
  const tickets = mock<Repository<Ticket>>();
  const seatAvailability = mock<SeatAvailabilityService>();
  const seatLock = mock<SeatLockService>();
  const paymentService = mock<PaymentService>();
  const events = mock<BookingEventPublisher>();
  const customers = mock<CustomerDirectoryService>();
  const redis = { exists: jest.fn() } as unknown as import('ioredis').default;

  let service: BookingsService;

  const holdRequest: HoldSeatsRequest = {
    userId: 'u1',
    showtimeId: 'st1',
    seatIds: ['seat1', 'seat2'],
  };
  beforeEach(() => {
    jest.resetAllMocks();
    service = new BookingsService(
      bookings,
      bookingSeats,
      payments,
      tickets,
      seatAvailability,
      seatLock,
      paymentService,
      events,
      customers,
      redis,
    );
    paymentService.externalIdFor.mockImplementation(
      (bookingId: string) => `cix-${bookingId}`,
    );
    customers.contactFor.mockResolvedValue({
      id: 'u1',
      email: 'u1@example.com',
      name: 'U One',
    });
    seatLock.lockKey.mockImplementation(
      (showtimeId: string, seatId: string) => `seat:${showtimeId}:${seatId}`,
    );
  });

  describe('hold', () => {
    it('locks the seats and creates a PENDING booking with snapshots', async () => {
      const saved = makeBooking();
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(makeHandle());
      bookings.save.mockResolvedValue(saved);
      bookingSeats.create.mockImplementation((s) => s as BookingSeat);
      bookingSeats.save.mockResolvedValue([] as never);
      payments.create.mockImplementation((p) => p as Payment);
      payments.save.mockResolvedValue({} as Payment);

      const result = await service.hold(holdRequest);

      expect(seatLock.hold).toHaveBeenCalledWith(
        ['seat:st1:seat1', 'seat:st1:seat2'],
        HOLD_TTL_MS,
      );
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          showtimeId: 'st1',
          totalAmount: 100000,
          currency: 'IDR',
          status: 'PENDING',
        }),
      );
      expect(bookingSeats.create).toHaveBeenCalledTimes(2);
      expect(bookingSeats.create).toHaveBeenCalledWith(
        expect.objectContaining({
          booking: saved,
          seatId: 'seat1',
          rowLabel: 'A',
          seatNumber: 1,
          category: 'REGULAR',
          priceAmount: 50000,
        }),
      );
      expect(payments.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          bookingId: 'b1',
          status: 'PENDING',
          totalAmount: 100000,
          currency: 'IDR',
          payment: {
            externalId: 'cix-b1',
            method: 'XENDIT',
            status: 'PENDING',
            checkoutUrl: null,
            invoiceId: null,
          },
        }),
      );
      expect(result.seats).toHaveLength(2);
      expect(typeof result.expiresAt).toBe('string');
    });

    it('rejects with 400 when no seats are requested', async () => {
      await expectStatus(service.hold({ ...holdRequest, seatIds: [] }), 400);
      expect(seatLock.hold).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the redlock cannot be acquired', async () => {
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockRejectedValue(new Error('conflict'));

      await expectStatus(service.hold(holdRequest), 409);
    });

    it('rejects with 400 when more than 8 seats are requested', async () => {
      const seatIds = Array.from({ length: 9 }, (_, i) => `seat${i}`);
      await expectStatus(service.hold({ ...holdRequest, seatIds }), 400);
      expect(seatLock.hold).not.toHaveBeenCalled();
    });

    it('rejects with 503 when Redis is unreachable (not 409)', async () => {
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

      await expectStatus(service.hold(holdRequest), 503);
    });

    it('clears stale seat rows so a cancelled seat can be re-booked', async () => {
      const saved = makeBooking();
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(makeHandle());
      bookings.save.mockResolvedValue(saved);
      bookingSeats.create.mockImplementation((s) => s as BookingSeat);
      bookingSeats.save.mockResolvedValue([] as never);
      bookingSeats.find.mockResolvedValue([
        { id: 'stale-bs-1' } as BookingSeat,
      ]);
      bookingSeats.delete.mockResolvedValue({} as never);
      payments.create.mockImplementation((p) => p as Payment);
      payments.save.mockResolvedValue({} as Payment);

      const result = await service.hold(holdRequest);

      expect(bookingSeats.delete).toHaveBeenCalledWith(['stale-bs-1']);
      expect(result.status).toBe('PENDING');
    });

    it('deletes the orphan booking when seat persistence fails', async () => {
      const handle = makeHandle();
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(handle);
      bookings.save.mockResolvedValue(makeBooking());
      bookingSeats.find.mockResolvedValue([]);
      bookingSeats.create.mockImplementation((s) => s as BookingSeat);
      bookingSeats.save.mockRejectedValue(new Error('db down'));
      bookings.delete.mockResolvedValue({} as never);

      await expect(service.hold(holdRequest)).rejects.toThrow('db down');
      expect(handle.release).toHaveBeenCalled();
      expect(bookings.delete).toHaveBeenCalledWith('b1');
    });

    it('rejects with 404 when a seat is invalid or the showtime is unknown', async () => {
      seatAvailability.validateSeats.mockRejectedValue(
        new Error('Seat seat9 does not exist for showtime st1'),
      );

      await expectStatus(service.hold(holdRequest), 404);
    });

    it('releases the lock and propagates when persistence fails', async () => {
      const handle = makeHandle();
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(handle);
      bookings.save.mockRejectedValue(new Error('db down'));

      await expect(service.hold(holdRequest)).rejects.toThrow('db down');
      expect(handle.release).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('marks a PENDING booking as CANCELLED and releases the seat locks', async () => {
      const saved = makeBooking();
      const handle = makeHandle();
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(handle);
      bookings.save
        .mockResolvedValueOnce(saved)
        .mockResolvedValueOnce({ ...saved, status: 'CANCELLED' });
      bookingSeats.create.mockImplementation((s) => s as BookingSeat);
      bookingSeats.save.mockResolvedValue([] as never);
      payments.create.mockImplementation((p) => p as Payment);
      payments.save.mockResolvedValue({} as Payment);

      await service.hold(holdRequest);

      bookings.findOne.mockResolvedValue({ ...saved, seats: [] });
      bookings.findOneOrFail.mockResolvedValue({
        ...saved,
        status: 'CANCELLED',
        seats: [],
      });

      const result = await service.cancel({
        id: 'b1',
        userId: 'u1',
      });

      expect(result.status).toBe('CANCELLED');
      expect(handle.release).toHaveBeenCalled();
      // 'CANCELLED' alone cannot tell funnel abandonment from a declined
      // payment, so the reason is recorded alongside it.
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          cancellationReason: 'CUSTOMER',
        }),
      );
    });

    it('rejects with 409 when the booking is not cancellable', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'EXPIRED' }));

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 409);
    });

    it('reclaims seat rows left by a REFUNDED booking on the next hold', async () => {
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(makeHandle());
      bookings.save.mockResolvedValue(makeBooking());
      bookingSeats.create.mockImplementation((s) => s as BookingSeat);
      bookingSeats.save.mockResolvedValue([] as never);
      payments.create.mockImplementation((p) => p as Payment);
      payments.save.mockResolvedValue({} as Payment);

      await service.hold(holdRequest);

      expect(bookingSeats.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            booking: expect.arrayContaining([{ status: 'REFUNDED' }]),
          }),
        }),
      );
    });
  });

  describe('cancel — paid (CONFIRMED) booking refund', () => {
    function confirmedBooking(overrides?: Partial<Booking>): Booking {
      return makeBooking({ status: 'CONFIRMED', ...overrides });
    }

    function paidPayment(overrides?: Partial<Payment>): Payment {
      return {
        id: 'p1',
        externalId: 'cix-b1',
        invoiceId: 'inv_123',
        status: 'PAID',
        amount: 100000,
        currency: 'IDR',
        refundId: null,
        refundedAt: null,
        booking: confirmedBooking(),
        ...overrides,
      } as Payment;
    }

    it('issues a refund and marks the booking REFUNDED when Xendit succeeds', async () => {
      bookings.findOne.mockResolvedValue({ ...confirmedBooking(), seats: [] });
      payments.findOne.mockResolvedValue(paidPayment());
      paymentService.createRefundForPayment.mockResolvedValue({
        refundId: 'rfd_1',
        status: 'SUCCEEDED',
      });
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));
      tickets.find.mockResolvedValue([{ id: 't1' } as Ticket]);
      bookings.findOneOrFail.mockResolvedValue(
        confirmedBooking({ status: 'REFUNDED', seats: [] }),
      );

      const result = await service.cancel({ id: 'b1', userId: 'u1' });

      expect(paymentService.createRefundForPayment).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'inv_123', amount: 100000 }),
      );
      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REFUNDED', refundId: 'rfd_1' }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REFUNDED' }),
      );
      expect(tickets.delete).toHaveBeenCalledWith(['t1']);
      expect(result.status).toBe('REFUNDED');
    });

    it('marks the booking REFUND_PENDING when Xendit accepts but has not settled', async () => {
      bookings.findOne.mockResolvedValue({ ...confirmedBooking(), seats: [] });
      payments.findOne.mockResolvedValue(paidPayment());
      paymentService.createRefundForPayment.mockResolvedValue({
        refundId: 'rfd_2',
        status: 'PENDING',
      });
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));
      bookings.findOneOrFail.mockResolvedValue(
        confirmedBooking({ status: 'REFUND_PENDING', seats: [] }),
      );

      const result = await service.cancel({ id: 'b1', userId: 'u1' });

      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REFUND_PENDING' }),
      );
      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REFUND_PENDING',
          refundId: 'rfd_2',
        }),
      );
      // Tickets stay valid until the money is actually returned.
      expect(tickets.delete).not.toHaveBeenCalled();
      expect(result.status).toBe('REFUND_PENDING');
    });

    it('rejects with 409 when there is no paid payment to refund', async () => {
      bookings.findOne.mockResolvedValue(confirmedBooking());
      payments.findOne.mockResolvedValue(null);

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 409);
      expect(paymentService.createRefundForPayment).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the paid payment has no invoice id', async () => {
      bookings.findOne.mockResolvedValue(confirmedBooking());
      payments.findOne.mockResolvedValue(paidPayment({ invoiceId: null }));

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 409);
      expect(paymentService.createRefundForPayment).not.toHaveBeenCalled();
    });

    it('keeps the booking CONFIRMED and returns 502 when the provider fails', async () => {
      bookings.findOne.mockResolvedValue(confirmedBooking());
      payments.findOne.mockResolvedValue(paidPayment());
      paymentService.createRefundForPayment.mockRejectedValue(
        new Error('xendit down'),
      );

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 502);
      expect(bookings.save).not.toHaveBeenCalled();
      expect(payments.save).not.toHaveBeenCalled();
    });

    it('rejects with 409 when a refund is already pending', async () => {
      bookings.findOne.mockResolvedValue(
        makeBooking({ status: 'REFUND_PENDING' }),
      );

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 409);
      expect(paymentService.createRefundForPayment).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the booking is already refunded', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'REFUNDED' }));

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 409);
      expect(paymentService.createRefundForPayment).not.toHaveBeenCalled();
    });

    it('rejects with 404 when the booking belongs to another user', async () => {
      bookings.findOne.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', userId: 'other' }),
      );

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 404);
    });
  });

  describe('availability', () => {
    function seatRow(seatId: string, booking: Booking): BookingSeat {
      return {
        id: `bs-${seatId}`,
        booking,
        showtimeId: 'st1',
        seatId,
        rowLabel: 'A',
        seatNumber: 1,
        category: 'REGULAR',
        priceAmount: 50000,
        priceCurrency: 'IDR',
      };
    }

    it('keeps REFUND_PENDING seats BOOKED and frees REFUNDED seats', async () => {
      const pending = makeBooking({ id: 'b1', status: 'REFUND_PENDING' });
      const refunded = makeBooking({ id: 'b2', status: 'REFUNDED' });
      bookings.find.mockResolvedValue([
        { ...pending, seats: [seatRow('seat1', pending)] },
        { ...refunded, seats: [seatRow('seat2', refunded)] },
      ]);

      const result = await service.availability({ showtimeId: 'st1' });

      expect(result.seats).toEqual([{ seatId: 'seat1', status: 'BOOKED' }]);
    });

    it('reports live PENDING holds as HELD', async () => {
      const held = makeBooking({ id: 'b1', status: 'PENDING' });
      bookings.find.mockResolvedValue([
        { ...held, seats: [seatRow('seat1', held)] },
      ]);

      const result = await service.availability({ showtimeId: 'st1' });

      expect(result.seats).toEqual([{ seatId: 'seat1', status: 'HELD' }]);
    });
  });

  describe('reconcileRefunds', () => {
    function refundPendingBooking(): Booking {
      return makeBooking({ id: 'b1', status: 'REFUND_PENDING' });
    }

    function refundPendingPayment(): Payment {
      return {
        id: 'p1',
        externalId: 'cix-b1',
        invoiceId: 'inv_123',
        status: 'REFUND_PENDING',
        amount: 100000,
        currency: 'IDR',
        refundId: 'rfd_1',
        refundedAt: null,
        booking: refundPendingBooking(),
      } as unknown as Payment;
    }

    it('finalizes bookings whose refund succeeded', async () => {
      bookings.find.mockResolvedValue([refundPendingBooking()]);
      payments.findOne.mockResolvedValue(refundPendingPayment());
      paymentService.getRefundStatus.mockResolvedValue('SUCCEEDED');
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));
      tickets.find.mockResolvedValue([{ id: 't1' } as Ticket]);

      const result = await service.reconcileRefunds();

      expect(result.finalized).toEqual(['b1']);
      expect(result.reverted).toEqual([]);
      expect(paymentService.getRefundStatus).toHaveBeenCalledWith('rfd_1');
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REFUNDED' }),
      );
      expect(tickets.delete).toHaveBeenCalledWith(['t1']);
    });

    it('reverts a booking to CONFIRMED when the refund failed', async () => {
      bookings.find.mockResolvedValue([refundPendingBooking()]);
      payments.findOne.mockResolvedValue(refundPendingPayment());
      paymentService.getRefundStatus.mockResolvedValue('FAILED');
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));

      const result = await service.reconcileRefunds();

      expect(result.finalized).toEqual([]);
      expect(result.reverted).toEqual(['b1']);
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PAID' }),
      );
      expect(tickets.delete).not.toHaveBeenCalled();
    });

    it('leaves still-PENDING refunds untouched', async () => {
      bookings.find.mockResolvedValue([refundPendingBooking()]);
      payments.findOne.mockResolvedValue(refundPendingPayment());
      paymentService.getRefundStatus.mockResolvedValue('PENDING');

      const result = await service.reconcileRefunds();

      expect(result).toEqual({ finalized: [], reverted: [] });
      expect(bookings.save).not.toHaveBeenCalled();
      expect(payments.save).not.toHaveBeenCalled();
    });

    it('skips a booking whose refund cannot be looked up', async () => {
      bookings.find.mockResolvedValue([refundPendingBooking()]);
      payments.findOne.mockResolvedValue(refundPendingPayment());
      paymentService.getRefundStatus.mockRejectedValue(
        new Error('provider down'),
      );

      const result = await service.reconcileRefunds();

      expect(result).toEqual({ finalized: [], reverted: [] });
      expect(bookings.save).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns a BookingDto for an owned booking', async () => {
      bookings.findOne.mockResolvedValue(makeBooking());
      bookings.findOneOrFail.mockResolvedValue(makeBooking({ seats: [] }));

      const result = await service.get({ id: 'b1', userId: 'u1' });

      expect(result).toEqual(
        expect.objectContaining({
          id: 'b1',
          userId: 'u1',
          showtimeId: 'st1',
          totalAmount: 100000,
          status: 'PENDING',
        }),
      );
    });

    it('rejects with 404 for an unknown or foreign booking', async () => {
      bookings.findOne.mockResolvedValue(null);
      await expectStatus(service.get({ id: 'b1', userId: 'u1' }), 404);

      bookings.findOne.mockResolvedValue(makeBooking());
      await expectStatus(service.get({ id: 'b1', userId: 'u2' }), 404);
    });
  });

  describe('list', () => {
    it('paginates the user bookings with metadata', async () => {
      bookings.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.list({ userId: 'u1', page: 1, limit: 20 });

      expect(bookings.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
      });
    });
  });

  describe('charge (Xendit)', () => {
    it('creates a hosted invoice and returns its checkout URL', async () => {
      const booking = makeBooking({ status: 'PENDING' });
      bookings.findOne.mockResolvedValue(booking);
      payments.findOne.mockResolvedValue({
        id: 'p1',
        externalId: 'cix-b1',
        status: 'PENDING',
        invoiceId: null,
        checkoutUrl: null,
      } as Payment);
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));
      seatAvailability.getSeatMap.mockResolvedValue(seatMap);
      paymentService.createInvoiceForBooking.mockResolvedValue({
        invoiceId: 'inv_123',
        checkoutUrl: 'https://checkout.xendit.co/inv_123',
        externalId: 'cix-b1',
      });

      const result = await service.charge({ bookingId: 'b1', userId: 'u1' });

      expect(paymentService.createInvoiceForBooking).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'b1', amount: 100000 }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          method: 'XENDIT',
          paid: false,
          invoiceId: 'inv_123',
          checkoutUrl: 'https://checkout.xendit.co/inv_123',
        }),
      );
    });

    it('reuses a live invoice instead of creating a duplicate', async () => {
      const booking = makeBooking({ status: 'PENDING' });
      bookings.findOne.mockResolvedValue(booking);
      payments.findOne.mockResolvedValue({
        id: 'p1',
        externalId: 'cix-b1',
        status: 'PENDING',
        invoiceId: 'inv_live',
        checkoutUrl: 'https://checkout.xendit.co/inv_live',
      } as Payment);
      paymentService.getInvoiceStatus.mockResolvedValue('PENDING');

      const result = await service.charge({ bookingId: 'b1', userId: 'u1' });

      expect(paymentService.createInvoiceForBooking).not.toHaveBeenCalled();
      expect(result.invoiceId).toBe('inv_live');
    });

    it('rejects with 410 when the booking already expired', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'EXPIRED' }));

      await expectStatus(
        service.charge({ bookingId: 'b1', userId: 'u1' }),
        410,
      );
    });

    it('rejects with 404 for a foreign booking', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ userId: 'other' }));

      await expectStatus(
        service.charge({ bookingId: 'b1', userId: 'u1' }),
        404,
      );
    });
  });

  describe('syncPaymentStatus (Xendit status check)', () => {
    function pendingInvoice(): Payment {
      return {
        id: 'p1',
        externalId: 'cix-b1',
        status: 'PENDING',
        invoiceId: 'inv_live',
        checkoutUrl: 'https://checkout.xendit.co/inv_live',
      } as Payment;
    }

    function setupPending(): void {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'PENDING', seats: [] }),
      );
      payments.findOne.mockResolvedValue(pendingInvoice());
      payments.save.mockResolvedValue({} as Payment);
      bookings.save.mockResolvedValue(makeBooking({ status: 'PENDING' }));
    }

    it('confirms the booking when Xendit reports the invoice PAID', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('PAID');
      bookings.save.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();
      // assertHoldLive Redis fallback: both seat locks must exist.
      (redis.exists as unknown as jest.Mock).mockResolvedValue(2);

      const result = await service.syncPaymentStatus({
        bookingId: 'b1',
        userId: 'u1',
      });

      expect(paymentService.getInvoiceStatus).toHaveBeenCalledWith('inv_live');
      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', status: 'PAID' }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
      expect(tickets.create).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('CONFIRMED');
    });

    it('publishes the confirmation and receipt events on PAID', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('PAID');
      bookings.save.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();
      (redis.exists as unknown as jest.Mock).mockResolvedValue(2);

      await service.syncPaymentStatus({ bookingId: 'b1', userId: 'u1' });

      expect(events.bookingConfirmed).toHaveBeenCalledTimes(1);
      expect(events.paymentReceived).toHaveBeenCalledTimes(1);
      expect(events.bookingConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'b1',
          recipient: { to: 'u1@example.com', name: 'U One' },
          movieTitle: seatMap.movieTitle,
        }),
      );
    });

    it('still confirms the booking when publishing the events fails', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('PAID');
      bookings.save.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();
      (redis.exists as unknown as jest.Mock).mockResolvedValue(2);
      events.bookingConfirmed.mockRejectedValue(new Error('broker down'));

      // Email is best-effort: a dead broker must never roll back a payment.
      const result = await service.syncPaymentStatus({
        bookingId: 'b1',
        userId: 'u1',
      });

      expect(result.status).toBe('CONFIRMED');
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
    });

    it('skips publishing when the customer cannot be resolved', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('PAID');
      bookings.save.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();
      (redis.exists as unknown as jest.Mock).mockResolvedValue(2);
      customers.contactFor.mockResolvedValue(null);

      await service.syncPaymentStatus({ bookingId: 'b1', userId: 'u1' });

      expect(events.bookingConfirmed).not.toHaveBeenCalled();
      expect(events.paymentReceived).not.toHaveBeenCalled();
    });

    it('cancels the booking when Xendit reports the invoice EXPIRED', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('EXPIRED');
      bookings.save.mockResolvedValue(makeBooking({ status: 'CANCELLED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CANCELLED', seats: [] }),
      );

      const result = await service.syncPaymentStatus({
        bookingId: 'b1',
        userId: 'u1',
      });

      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', status: 'FAILED' }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          cancellationReason: 'PAYMENT_DECLINED',
        }),
      );
      expect(tickets.create).not.toHaveBeenCalled();
      expect(result.status).toBe('CANCELLED');
    });

    it('leaves a PENDING invoice untouched', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('PENDING');

      const result = await service.syncPaymentStatus({
        bookingId: 'b1',
        userId: 'u1',
      });

      expect(result.status).toBe('PENDING');
      expect(bookings.save).not.toHaveBeenCalled();
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('returns the booking unchanged when already terminal', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );

      const result = await service.syncPaymentStatus({
        bookingId: 'b1',
        userId: 'u1',
      });

      expect(paymentService.getInvoiceStatus).not.toHaveBeenCalled();
      expect(result.status).toBe('CONFIRMED');
    });

    it('rejects with 409 when the booking has no invoice', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      payments.findOne.mockResolvedValue({
        invoiceId: null,
      } as unknown as Payment);

      await expectStatus(
        service.syncPaymentStatus({ bookingId: 'b1', userId: 'u1' }),
        409,
      );
    });

    it('maps provider failures to 502', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockRejectedValue(new Error('socket'));

      await expectStatus(
        service.syncPaymentStatus({ bookingId: 'b1', userId: 'u1' }),
        502,
      );
    });

    it('rejects with 410 when the hold expired even if Xendit says PAID', async () => {
      setupPending();
      paymentService.getInvoiceStatus.mockResolvedValue('PAID');
      // Expired booking: expiresAt in the past → assertHoldLive fails.
      bookings.findOne.mockResolvedValue(
        makeBooking({
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000),
        }),
      );
      bookings.save.mockResolvedValue(makeBooking({ status: 'EXPIRED' }));

      await expectStatus(
        service.syncPaymentStatus({ bookingId: 'b1', userId: 'u1' }),
        410,
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
    });
  });

  describe('webhook (Xendit)', () => {
    const paidBody = JSON.stringify({
      id: 'inv_123',
      external_id: 'cix-b1',
      status: 'PAID',
      paid_at: '2026-08-20T11:00:00.000Z',
    });

    function paymentRow(status = 'PENDING'): Payment {
      return {
        id: 'p1',
        externalId: 'cix-b1',
        invoiceId: 'inv_123',
        status,
        booking: makeBooking({ status: 'PENDING' }),
      } as Payment;
    }

    beforeEach(() => {
      paymentService.verifySignature.mockImplementation(() => undefined);
      paymentService.parseCallback.mockImplementation((raw: string) => {
        const data = JSON.parse(raw) as {
          id: string;
          external_id: string;
          status: 'PAID' | 'EXPIRED';
        };
        return {
          id: data.id,
          external_id: data.external_id,
          status: data.status,
          paid_at: '2026-08-20T11:00:00.000Z',
          payment_method: null,
          payment_channel: null,
          paid_amount: null,
          amount: null,
        };
      });
    });

    it('confirms the booking and issues tickets on PAID', async () => {
      payments.findOne.mockResolvedValueOnce(paymentRow());
      const full = makeBooking({ status: 'PENDING' });
      bookings.findOne.mockResolvedValue(full);
      (redis.exists as jest.Mock).mockResolvedValue(2);
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));
      tickets.find.mockResolvedValue([]);
      seatAvailability.getSeatMap.mockResolvedValue(seatMap);
      bookingSeats.find.mockResolvedValue([
        {
          id: 'bs1',
          booking: full,
          showtimeId: 'st1',
          seatId: 'seat1',
          rowLabel: 'A',
          seatNumber: 1,
          category: 'REGULAR',
          priceAmount: 50000,
          priceCurrency: 'IDR',
        } as BookingSeat,
        {
          id: 'bs2',
          booking: full,
          showtimeId: 'st1',
          seatId: 'seat2',
          rowLabel: 'A',
          seatNumber: 2,
          category: 'REGULAR',
          priceAmount: 50000,
          priceCurrency: 'IDR',
        } as BookingSeat,
      ]);
      tickets.create.mockImplementation(
        (t: DeepPartial<Ticket>) => ({ ...t, id: 't1' }) as Ticket,
      );
      tickets.save.mockImplementation(((c: unknown) =>
        Promise.resolve(c)) as never);

      await service.webhook({ signature: 'tok', body: paidBody });

      expect(paymentService.verifySignature).toHaveBeenCalledWith('tok');
      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PAID' }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
      // The webhook path notifies too — there is only one confirmation story.
      expect(events.bookingConfirmed).toHaveBeenCalledTimes(1);
      expect(events.paymentReceived).toHaveBeenCalledTimes(1);
      expect(events.bookingConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'b1',
          tickets: expect.arrayContaining([
            expect.objectContaining({ code: expect.stringMatching(/^TKT-/) }),
          ]),
        }),
      );
    });

    it('is idempotent for an already CONFIRMED booking', async () => {
      payments.findOne.mockResolvedValueOnce(paymentRow());
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

      await expect(
        service.webhook({ signature: 'tok', body: paidBody }),
      ).resolves.toEqual({});
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('cancels the booking on EXPIRED', async () => {
      paymentService.parseCallback.mockReturnValue({
        id: 'inv_123',
        external_id: 'cix-b1',
        status: 'EXPIRED',
        paid_at: null,
        payment_method: null,
        payment_channel: null,
        paid_amount: null,
        amount: null,
      });
      payments.findOne.mockResolvedValueOnce(paymentRow());
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));

      await service.webhook({
        signature: 'tok',
        body: JSON.stringify({
          id: 'inv_123',
          external_id: 'cix-b1',
          status: 'EXPIRED',
        }),
      });

      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          cancellationReason: 'PAYMENT_DECLINED',
        }),
      );
    });

    it('rejects with 404 when the payment is unknown', async () => {
      payments.findOne.mockResolvedValue(null);

      await expectStatus(
        service.webhook({ signature: 'tok', body: paidBody }),
        404,
      );
    });

    it('rejects a late PAID with 410 and issues no tickets when the hold expired', async () => {
      payments.findOne.mockResolvedValueOnce(paymentRow());
      bookings.findOne.mockResolvedValue(
        makeBooking({
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000),
        }),
      );
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));

      await expectStatus(
        service.webhook({ signature: 'tok', body: paidBody }),
        410,
      );

      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('rejects PAID with 410 when the Redis seat locks are gone (other replica hold)', async () => {
      payments.findOne.mockResolvedValueOnce(paymentRow());
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookingSeats.find.mockResolvedValue([
        { seatId: 'seat1' } as BookingSeat,
        { seatId: 'seat2' } as BookingSeat,
      ]);
      (redis.exists as jest.Mock).mockResolvedValue(1); // one key missing
      bookings.save.mockImplementation((b) => Promise.resolve(b as Booking));

      await expectStatus(
        service.webhook({ signature: 'tok', body: paidBody }),
        410,
      );

      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('fails closed with 503 when Redis is unreachable during confirm', async () => {
      payments.findOne.mockResolvedValueOnce(paymentRow());
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookingSeats.find.mockResolvedValue([{ seatId: 'seat1' } as BookingSeat]);
      (redis.exists as jest.Mock).mockRejectedValue(
        new Error('ECONNREFUSED 127.0.0.1:6379'),
      );

      await expectStatus(
        service.webhook({ signature: 'tok', body: paidBody }),
        503,
      );
      expect(tickets.create).not.toHaveBeenCalled();
    });
  });

  describe('charge concurrency', () => {
    it('serializes concurrent charges into a single invoice creation', async () => {
      const booking = makeBooking({ status: 'PENDING' });
      bookings.findOne.mockResolvedValue(booking);
      payments.findOne.mockResolvedValue({
        id: 'p1',
        externalId: 'cix-b1',
        status: 'PENDING',
        invoiceId: null,
        checkoutUrl: null,
      } as Payment);
      payments.save.mockImplementation((p) => Promise.resolve(p as Payment));
      seatAvailability.getSeatMap.mockResolvedValue(seatMap);
      let calls = 0;
      paymentService.createInvoiceForBooking.mockImplementation(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          invoiceId: 'inv_123',
          checkoutUrl: 'https://checkout.xendit.co/inv_123',
          externalId: 'cix-b1',
        };
      });

      const [first, second] = await Promise.all([
        service.charge({ bookingId: 'b1', userId: 'u1' }),
        service.charge({ bookingId: 'b1', userId: 'u1' }),
      ]);

      expect(calls).toBe(1);
      expect(first.invoiceId).toBe('inv_123');
      expect(second.invoiceId).toBe('inv_123');
    });
  });

  describe('issueTickets', () => {
    it('issues one TKT-XXXXXX ticket per seat for a confirmed booking', async () => {
      const confirmed = makeBooking({ status: 'CONFIRMED' });
      bookings.findOne.mockResolvedValue(confirmed);
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();

      const result = await service.issueTickets({
        id: 'b1',
        userId: 'u1',
      });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].code).toMatch(/^TKT-[A-Z2-9]{8}$/);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          bookingId: 'b1',
          movieTitle: 'The Grand Adventure',
          theaterName: 'Grand Cineplex 1',
        }),
      );
    });

    it('reuses existing tickets instead of duplicating', async () => {
      const confirmed = makeBooking({ status: 'CONFIRMED' });
      bookings.findOne.mockResolvedValue(confirmed);
      tickets.find.mockResolvedValue([
        {
          id: 't1',
          code: 'TKT-EXIST1',
          booking: confirmed,
          startsAt: new Date('2026-08-20T18:00:00Z'),
          createdAt: new Date('2026-08-20T10:00:00Z'),
        } as Ticket,
      ]);

      const result = await service.issueTickets({
        id: 'b1',
        userId: 'u1',
      });

      expect(result.items).toHaveLength(1);
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the booking is not confirmed', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));

      await expectStatus(service.issueTickets({ id: 'b1', userId: 'u1' }), 409);
    });
  });

  describe('listTickets', () => {
    it("returns a booking's tickets without creating any", async () => {
      const confirmed = makeBooking({ status: 'CONFIRMED' });
      bookings.findOne.mockResolvedValue(confirmed);
      tickets.find.mockResolvedValue([
        {
          id: 't1',
          code: 'TKT-EXIST1',
          booking: confirmed,
          movieTitle: 'The Grand Adventure',
          theaterName: 'Grand Cineplex 1',
          seatId: 'seat1',
          rowLabel: 'A',
          seatNumber: 1,
          startsAt: new Date('2026-08-20T18:00:00Z'),
          createdAt: new Date('2026-08-20T10:00:00Z'),
        } as Ticket,
      ]);

      const result = await service.listTickets({ id: 'b1', userId: 'u1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].code).toBe('TKT-EXIST1');
      // A read must never write.
      expect(tickets.create).not.toHaveBeenCalled();
      expect(tickets.save).not.toHaveBeenCalled();
      expect(seatAvailability.getSeatMap).not.toHaveBeenCalled();
    });

    it('returns nothing for a booking with no tickets yet', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      tickets.find.mockResolvedValue([]);

      const result = await service.listTickets({ id: 'b1', userId: 'u1' });

      expect(result.items).toEqual([]);
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it("rejects with 404 for another user's booking", async () => {
      bookings.findOne.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', userId: 'other' }),
      );

      await expectStatus(service.listTickets({ id: 'b1', userId: 'u1' }), 404);
    });
  });

  describe('expireStaleBookings', () => {
    it('marks stale PENDING bookings EXPIRED and returns the count', async () => {
      bookings.find.mockResolvedValue([
        makeBooking({ id: 'b1', status: 'PENDING' }),
        makeBooking({ id: 'b2', status: 'PENDING' }),
      ]);

      const result = await service.expireStaleBookings();

      expect(result.count).toBe(2);
      expect(result.expired).toEqual(['b1', 'b2']);
      expect(bookings.save).toHaveBeenCalledTimes(2);
      for (const call of bookings.save.mock.calls) {
        expect((call[0] as Booking).status).toBe('EXPIRED');
      }
    });

    it('records no cancellation reason for a lapsed hold', async () => {
      bookings.find.mockResolvedValue([
        makeBooking({ id: 'b1', status: 'PENDING' }),
      ]);

      await service.expireStaleBookings();

      // A lapsed hold is EXPIRED, not CANCELLED — nobody decided anything.
      const saved = bookings.save.mock.calls[0][0] as Booking;
      expect(saved.status).toBe('EXPIRED');
      expect(saved.cancellationReason ?? null).toBeNull();
    });

    it('returns zero when nothing is stale', async () => {
      bookings.find.mockResolvedValue([]);

      const result = await service.expireStaleBookings();

      expect(result).toEqual({ expired: [], count: 0 });
      expect(bookings.save).not.toHaveBeenCalled();
    });
  });

  function seatsForTickets(): void {
    const saved = makeBooking();
    const seat1: BookingSeat = {
      id: 'bs1',
      booking: saved,
      showtimeId: 'st1',
      seatId: 'seat1',
      rowLabel: 'A',
      seatNumber: 1,
      category: 'REGULAR',
      priceAmount: 50000,
      priceCurrency: 'IDR',
    };
    const seat2: BookingSeat = {
      ...seat1,
      id: 'bs2',
      seatId: 'seat2',
      seatNumber: 2,
    };
    bookingSeats.find.mockResolvedValue([seat1, seat2]);
    seatAvailability.getSeatMap.mockResolvedValue(seatMap);
  }

  function ticketSaveMock(): void {
    tickets.create.mockImplementation(
      (t: DeepPartial<Ticket>) =>
        ({ ...t, id: `t-${Math.random()}`, createdAt: new Date() }) as Ticket,
    );
    tickets.save.mockImplementation(((created: unknown) =>
      Promise.resolve(created)) as never);
  }
});
