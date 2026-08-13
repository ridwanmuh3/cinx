import { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { CinemaService } from '../cinema/cinema.service';
import { BookingsService } from './bookings.service';

function clientResponding(
  handlers: Record<string, (payload: unknown) => unknown>,
): ClientProxy {
  return {
    send: jest.fn((pattern: string, payload: unknown) => {
      const handler = handlers[pattern];
      if (!handler)
        return throwError(() => new Error(`no handler for ${pattern}`));
      try {
        return of(handler(payload));
      } catch (err) {
        return throwError(() => err);
      }
    }),
  } as unknown as ClientProxy;
}

describe('BookingsService', () => {
  const showtimeId = '42bbb090-8297-4e6b-a685-1acfcb9982cc';
  const userId = 'user-1';

  const bookingDto = {
    id: 'b1',
    userId,
    showtimeId,
    totalAmount: 100000,
    currency: 'IDR' as const,
    status: 'PENDING' as const,
    expiresAt: '2026-08-12T15:00:00.000Z',
    createdAt: '2026-08-12T14:00:00.000Z',
    updatedAt: '2026-08-12T14:00:00.000Z',
    seats: [],
  };

  const showtimeDto = {
    id: showtimeId,
    movie: {
      id: 'm1',
      title: 'The Grand Adventure',
      posterUrl: null,
      ageRating: '13+' as const,
      durationMinutes: 128,
    },
    theater: { id: 't1', name: 'Grand Cineplex 1' },
    startsAt: '2026-08-20T18:00:00.000Z',
    price: { amount: 50000, currency: 'IDR' as const },
    availableSeats: 96,
    createdAt: 'x',
    updatedAt: 'x',
  };

  function makeService(
    handlers: Record<string, (payload: unknown) => unknown>,
    cinema?: CinemaService,
  ) {
    const service = new BookingsService(
      clientResponding(handlers),
      cinema ??
        ({
          getShowtime: jest.fn().mockResolvedValue(showtimeDto),
        } as unknown as CinemaService),
    );
    return service;
  }

  it('pay charges the mock provider then confirms with the result', async () => {
    const charge = {
      providerId: 'p1',
      paid: true,
      paidAt: '2026-08-12T14:05:00Z',
      receiptUrl: 'r',
    };
    const confirmArg: unknown[] = [];
    const service = makeService({
      [TicketPatterns.PAYMENT_CHARGE]: () => charge,
      [TicketPatterns.PAYMENT_CONFIRM]: (payload) => {
        confirmArg.push(payload);
        return { ...bookingDto, status: 'CONFIRMED' };
      },
    });

    const result = await service.pay(userId, 'b1', { paymentMethod: 'MOCK' });

    expect(confirmArg[0]).toEqual({
      bookingId: 'b1',
      userId,
      paid: true,
      providerId: 'p1',
      paidAt: '2026-08-12T14:05:00Z',
      receipt: 'r',
    });
    expect(result.status).toBe('CONFIRMED');
    expect(result.movie?.title).toBe('The Grand Adventure');
  });

  it('pay with simulate FAILURE passes paid=false through to confirm', async () => {
    const charge = {
      providerId: 'p2',
      paid: false,
      paidAt: null,
      receiptUrl: null,
    };
    const confirmArg: unknown[] = [];
    const service = makeService({
      [TicketPatterns.PAYMENT_CHARGE]: (payload) => {
        expect(payload).toEqual({ simulate: 'FAILURE' });
        return charge;
      },
      [TicketPatterns.PAYMENT_CONFIRM]: (payload) => {
        confirmArg.push(payload);
        return { ...bookingDto, status: 'CANCELLED' };
      },
    });

    const result = await service.pay(userId, 'b1', {
      paymentMethod: 'MOCK',
      simulate: 'FAILURE',
    });
    expect((confirmArg[0] as { paid: boolean }).paid).toBe(false);
    expect(result.status).toBe('CANCELLED');
  });

  it('list enriches every item and preserves pagination metadata', async () => {
    const service = makeService({
      [TicketPatterns.BOOKING_LIST]: () => ({
        items: [bookingDto, { ...bookingDto, id: 'b2' }],
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      }),
    });

    const result = await service.list(userId, 1, 20);
    expect(result.items).toHaveLength(2);
    expect(
      (result.items[0] as { movie?: { title?: string } }).movie?.title,
    ).toBe('The Grand Adventure');
    expect(result.meta.total).toBe(2);
  });

  it('falls back to the raw booking when cinema enrichment fails', async () => {
    const cinema = {
      getShowtime: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as CinemaService;
    const service = makeService(
      {
        [TicketPatterns.BOOKING_GET]: () => bookingDto,
      },
      cinema,
    );

    const result = await service.get(userId, 'b1');
    expect(result.id).toBe('b1');
    expect(result.movie).toBeUndefined();
  });

  it('rethrows RPC errors from the ticket service', async () => {
    const service = makeService({
      [TicketPatterns.BOOKING_CANCEL]: () => {
        throw {
          statusCode: 409,
          message: 'Cannot cancel a confirmed booking',
          error: 'Conflict',
        };
      },
    });

    await expect(service.cancel(userId, 'b1')).rejects.toThrow(
      'Cannot cancel a confirmed booking',
    );
  });
});

import { TicketPatterns } from '@ticketing/shared';
