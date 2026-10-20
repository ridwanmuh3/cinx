import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import {
  BookingConfirmedData,
  PaymentReceivedData,
  PaymentSettledData,
  TicketsIssuedData,
} from '@ticketing/shared';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { BookingEventsPublisher } from '../events/booking-events.publisher';
import { SeatLockService } from '../lock/lock.module';
import { CustomerDirectoryService } from '../user/customer-directory.service';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    userId: 'u1',
    showtimeId: 'st1',
    movieTitle: 'The Grand Adventure',
    theaterName: 'Grand Cineplex 1',
    startsAt: new Date('2026-08-20T18:00:00.000Z'),
    totalAmount: 100000,
    currency: 'IDR',
    status: 'PENDING',
    cancellationReason: null,
    expiresAt: new Date(Date.now() + 60_000),
    paidAt: null,
    confirmedAt: null,
    ticketsIssuedAt: null,
    confirmationAttemptedAt: null,
    refundRequestedAt: null,
    createdAt: new Date('2026-08-12T14:00:00.000Z'),
    updatedAt: new Date('2026-08-12T14:00:00.000Z'),
    seats: [
      {
        id: 'bs1',
        booking: {} as Booking,
        showtimeId: 'st1',
        seatId: 's1',
        rowLabel: 'A',
        seatNumber: 1,
        category: 'REGULAR',
        priceAmount: 50000,
        priceCurrency: 'IDR',
      },
    ],
    ...overrides,
  };
}

function makeRepo(booking: Booking | null = null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(booking),
    findOneOrFail: jest.fn().mockResolvedValue(booking),
    find: jest.fn().mockResolvedValue(booking ? [booking] : []),
    save: jest.fn((row: Booking) => Promise.resolve(row)),
    delete: jest.fn(),
  };
  return repo as unknown as Repository<Booking> & {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
}

function makeSeatRepo() {
  const repo = {
    find: jest.fn().mockResolvedValue([{ seatId: 's1' }]),
    save: jest.fn(),
    delete: jest.fn(),
    create: jest.fn((row) => row),
  };
  return repo as unknown as Repository<BookingSeat> & {
    find: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
  };
}

function makeEvents() {
  return {
    confirmed: jest.fn().mockResolvedValue(undefined),
    cancelled: jest.fn().mockResolvedValue(undefined),
    expired: jest.fn().mockResolvedValue(undefined),
    refundRequested: jest.fn().mockResolvedValue(undefined),
    refunded: jest.fn().mockResolvedValue(undefined),
    paymentReceived: jest.fn().mockResolvedValue(undefined),
  } as unknown as BookingEventsPublisher & {
    confirmed: jest.Mock;
    cancelled: jest.Mock;
    expired: jest.Mock;
    refundRequested: jest.Mock;
    refunded: jest.Mock;
    paymentReceived: jest.Mock;
  };
}

function makeService(booking: Booking | null = null) {
  const bookings = makeRepo(booking);
  const seats = makeSeatRepo();
  const events = makeEvents();
  const seatLock = {
    lockKey: (showtimeId: string, seatId: string) =>
      `lock:${showtimeId}:${seatId}`,
    hold: jest.fn(),
  } as unknown as SeatLockService;
  const customers = {
    contactFor: jest
      .fn()
      .mockResolvedValue({ email: 'user@example.com', name: 'Ada' }),
  } as unknown as CustomerDirectoryService;
  const redis = {
    exists: jest.fn().mockResolvedValue(1),
  };
  const seatAvailability = {
    validateSeats: jest.fn(),
    getSeatMap: jest.fn(),
  } as unknown as SeatAvailabilityService;

  const service = new BookingsService(
    bookings,
    seats,
    seatAvailability,
    seatLock,
    events,
    customers,
    redis as never,
  );
  return { service, bookings, seats, events, seatLock, customers, redis };
}

const settled: PaymentSettledData = {
  bookingId: 'b1',
  paymentId: 'p1',
  externalId: 'cix-b1',
  invoiceId: 'inv_1',
  providerTxnId: 'inv_1',
  amount: 100000,
  currency: 'IDR',
  paidAt: '2026-08-12T14:10:00.000Z',
  method: 'XENDIT',
  receiptUrl: null,
};

describe('BookingsService', () => {
  it('payment.settled on a live hold sets paidAt but waits for tickets.issued', async () => {
    const booking = makeBooking();
    const { service, events } = makeService(booking);

    await service.onPaymentSettled(settled);

    expect(booking.paidAt).toEqual(new Date(settled.paidAt));
    expect(booking.status).toBe('PENDING');
    expect(events.confirmed).toHaveBeenCalledWith(
      expect.objectContaining<Partial<BookingConfirmedData>>({
        bookingId: 'b1',
        recipient: { to: 'user@example.com', name: 'Ada' },
        seats: [expect.objectContaining({ seatId: 's1' })],
      }),
    );
    expect(events.paymentReceived).toHaveBeenCalledWith(
      expect.objectContaining<Partial<PaymentReceivedData>>({
        bookingId: 'b1',
        amount: 100000,
        recipient: { to: 'user@example.com', name: 'Ada' },
      }),
    );
  });

  it('payment.settled after the hold expired never confirms and asks for a refund', async () => {
    const booking = makeBooking({ expiresAt: new Date(Date.now() - 1000) });
    const { service, events } = makeService(booking);

    await service.onPaymentSettled(settled);

    expect(booking.status).toBe('EXPIRED');
    expect(booking.paidAt).toBeNull();
    expect(events.confirmed).not.toHaveBeenCalled();
    expect(events.expired).toHaveBeenCalled();
    expect(events.refundRequested).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', reason: 'LATE_PAYMENT' }),
    );
  });

  it('tickets.issued moves a paid PENDING booking to CONFIRMED', async () => {
    const booking = makeBooking({ paidAt: new Date() });
    const { service } = makeService(booking);
    const issued: TicketsIssuedData = {
      recipient: null,
      bookingId: 'b1',
      userId: 'u1',
      showtimeId: 'st1',
      totalAmount: 100000,
      currency: 'IDR',
      movieTitle: 'The Grand Adventure',
      theaterName: 'Grand Cineplex 1',
      startsAt: '2026-08-20T18:00:00.000Z',
      seats: [],
      tickets: [],
      confirmedAt: '2026-08-12T14:10:00.000Z',
    };

    await service.onTicketsIssued(issued);

    expect(booking.status).toBe('CONFIRMED');
    expect(booking.ticketsIssuedAt).not.toBeNull();
  });

  it('prepareCharge rejects an expired booking and emits booking.expired', async () => {
    const booking = makeBooking({ expiresAt: new Date(Date.now() - 1000) });
    const { service, events } = makeService(booking);

    await expect(
      service.prepareCharge({ id: 'b1', userId: 'u1' }),
    ).rejects.toBeInstanceOf(RpcException);
    expect(booking.status).toBe('EXPIRED');
    expect(events.expired).toHaveBeenCalled();
  });

  it('availability reports a paid-but-unticketed hold as BOOKED, not HELD', async () => {
    const booking = makeBooking({ paidAt: new Date() });
    const { service } = makeService(booking);

    const result = await service.availability({ showtimeId: 'st1' });

    expect(result.seats).toEqual([{ seatId: 's1', status: 'BOOKED' }]);
  });
});
