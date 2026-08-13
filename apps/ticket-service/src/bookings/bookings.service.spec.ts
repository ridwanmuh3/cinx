import { mock, MockProxy } from 'jest-mock-extended';
import { DeepPartial, Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  HoldSeatsRequest,
  PaymentConfirmRequest,
  ShowtimeSeatMap,
} from '@ticketing/shared';
import { BookingsService } from './bookings.service';
import { Booking } from './booking.entity';
import { BookingSeat } from './booking-seat.entity';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { LockHandle, SeatLockService } from '../lock/lock.module';
import { MockPaymentService } from '../payments/mock-payment.service';

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
  const mockPayment = mock<MockPaymentService>();

  let service: BookingsService;

  const holdRequest: HoldSeatsRequest = {
    userId: 'u1',
    showtimeId: 'st1',
    seatIds: ['seat1', 'seat2'],
  };
  const confirmRequest: PaymentConfirmRequest = {
    bookingId: 'b1',
    userId: 'u1',
    paid: true,
    providerId: 'mop_x',
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
      mockPayment,
    );
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
      mockPayment.newProviderId.mockReturnValue('mop_provider');

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
            providerId: 'mop_provider',
            method: 'MOCK',
            status: 'PENDING',
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
      mockPayment.newProviderId.mockReturnValue('mop_provider');

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
    });

    it('rejects with 409 when the booking is not PENDING', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

      await expectStatus(service.cancel({ id: 'b1', userId: 'u1' }), 409);
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

  describe('confirm', () => {
    async function holdFirst(): Promise<MockProxy<LockHandle>> {
      const saved = makeBooking();
      const handle = makeHandle();
      seatAvailability.validateSeats.mockResolvedValue({
        seats: seatMap.seats,
        seatMap,
      });
      seatLock.hold.mockResolvedValue(handle);
      bookings.save.mockResolvedValue(saved);
      bookingSeats.create.mockImplementation((s) => s as BookingSeat);
      bookingSeats.save.mockResolvedValue([] as never);
      payments.create.mockImplementation((p) => p as Payment);
      payments.save.mockResolvedValue({} as Payment);
      bookingSeats.find.mockResolvedValue([]);
      mockPayment.newProviderId.mockReturnValue('mop_provider');
      await service.hold(holdRequest);
      return handle;
    }

    it('extends the lock, marks PAID/CONFIRMED and issues tickets', async () => {
      const handle = await holdFirst();

      const confirmed = makeBooking({ status: 'CONFIRMED' });
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookings.save.mockResolvedValue(confirmed);
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );
      payments.findOne.mockResolvedValue({
        id: 'p1',
        status: 'PENDING',
      } as Payment);
      payments.save.mockResolvedValue({} as Payment);
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();

      const result = await service.confirm(confirmRequest);

      expect(handle.extend).toHaveBeenCalledWith(HOLD_TTL_MS);
      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'p1',
          status: 'PAID',
          providerTxnId: 'mop_x',
        }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
      expect(tickets.create).toHaveBeenCalledTimes(2);
      const created = tickets.create.mock.calls.map(
        (c) => c[0] as { code: string },
      );
      expect(created.every((t) => t.code.startsWith('TKT-'))).toBe(true);
      expect(handle.release).toHaveBeenCalled();
      expect(result.status).toBe('CONFIRMED');
    });

    it('marks FAILED/CANCELLED and releases locks when payment did not go through', async () => {
      const handle = await holdFirst();

      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookings.save.mockResolvedValue(makeBooking({ status: 'CANCELLED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CANCELLED', seats: [] }),
      );
      payments.findOne.mockResolvedValue({
        id: 'p1',
        status: 'PENDING',
      } as Payment);
      payments.save.mockResolvedValue({} as Payment);

      const result = await service.confirm({
        ...confirmRequest,
        paid: false,
      });

      expect(payments.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', status: 'FAILED' }),
      );
      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED' }),
      );
      expect(tickets.create).not.toHaveBeenCalled();
      expect(handle.release).toHaveBeenCalled();
      expect(result.status).toBe('CANCELLED');
    });

    it('rejects with 410 when the booking already expired', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'EXPIRED' }));

      await expectStatus(service.confirm(confirmRequest), 410);
    });

    it('rejects with 410 and expires the booking when the lock was lost', async () => {
      const handle = await holdFirst();
      handle.extend.mockRejectedValue(new Error('lock lost'));

      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));
      bookings.save.mockResolvedValue(makeBooking({ status: 'EXPIRED' }));

      await expectStatus(service.confirm(confirmRequest), 410);

      expect(bookings.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
    });

    it('is idempotent for already CONFIRMED bookings', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));
      bookings.findOneOrFail.mockResolvedValue(
        makeBooking({ status: 'CONFIRMED', seats: [] }),
      );

      const result = await service.confirm(confirmRequest);

      expect(result.status).toBe('CONFIRMED');
      expect(bookings.save).not.toHaveBeenCalled();
    });
  });

  describe('createTickets', () => {
    it('issues one TKT-XXXXXX ticket per seat for a confirmed booking', async () => {
      const confirmed = makeBooking({ status: 'CONFIRMED' });
      bookings.findOne.mockResolvedValue(confirmed);
      tickets.find.mockResolvedValue([]);
      seatsForTickets();
      ticketSaveMock();

      const result = await service.createTickets({
        id: 'b1',
        userId: 'u1',
      });
      expect(result).toHaveLength(2);
      expect(result[0].code).toMatch(/^TKT-[A-Z2-9]{6}$/);
      expect(result[0]).toEqual(
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

      const result = await service.createTickets({
        id: 'b1',
        userId: 'u1',
      });

      expect(result).toHaveLength(1);
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the booking is not confirmed', async () => {
      bookings.findOne.mockResolvedValue(makeBooking({ status: 'PENDING' }));

      await expectStatus(
        service.createTickets({ id: 'b1', userId: 'u1' }),
        409,
      );
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
