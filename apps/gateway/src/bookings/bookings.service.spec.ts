import { ClientGrpc } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import {
  BookingServiceStub,
  ChargeContext,
  PaymentServiceStub,
  TicketServiceStub,
} from '@ticketing/shared';
import { CinemaService } from '../cinema/cinema.service';
import { BookingsService } from './bookings.service';

function grpcClient<T>(stub: Partial<T>): ClientGrpc {
  return {
    getService: () => stub,
  } as unknown as ClientGrpc;
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
    cancellationReason: null,
    expiresAt: '2026-08-12T15:00:00.000Z',
    createdAt: '2026-08-12T14:00:00.000Z',
    updatedAt: '2026-08-12T14:00:00.000Z',
    seats: [],
  };

  const chargeContext: ChargeContext = {
    bookingId: 'b1',
    userId,
    amount: 100000,
    currency: 'IDR',
    expiresAt: '2026-08-12T15:00:00.000Z',
    description: 'CinX: The Grand Adventure @ Grand Cineplex 1',
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
    options: {
      booking?: Partial<BookingServiceStub>;
      payment?: Partial<PaymentServiceStub>;
      ticket?: Partial<TicketServiceStub>;
      cinema?: CinemaService;
    } = {},
  ) {
    return new BookingsService(
      grpcClient<BookingServiceStub>(options.booking ?? {}),
      grpcClient<PaymentServiceStub>(options.payment ?? {}),
      grpcClient<TicketServiceStub>(options.ticket ?? {}),
      options.cinema ??
        ({
          getShowtime: jest.fn().mockResolvedValue(showtimeDto),
        } as unknown as CinemaService),
    );
  }

  it('pay composes PrepareCharge and Charge and returns the checkout URL', async () => {
    const chargeArg: unknown[] = [];
    const charge = {
      externalId: 'cix-b1',
      paid: false,
      providerTxnId: null,
      paidAt: null,
      receiptUrl: null,
      checkoutUrl: 'https://checkout.xendit.co/inv_1',
      invoiceId: 'inv_1',
      method: 'XENDIT' as const,
    };
    const service = makeService({
      booking: {
        PrepareCharge: (() =>
          of(chargeContext)) as BookingServiceStub['PrepareCharge'],
        Get: (() => of(bookingDto)) as BookingServiceStub['Get'],
      },
      payment: {
        Charge: ((payload: unknown) => {
          chargeArg.push(payload);
          return of(charge);
        }) as PaymentServiceStub['Charge'],
      },
    });

    const result = await service.pay(userId, 'b1', {});

    expect(chargeArg[0]).toEqual({
      bookingId: 'b1',
      userId,
      amount: 100000,
      currency: 'IDR',
      expiresAt: '2026-08-12T15:00:00.000Z',
      description: 'CinX: The Grand Adventure @ Grand Cineplex 1',
      returnUrl: '',
      payerEmail: '',
    });
    expect(result.checkoutUrl).toBe('https://checkout.xendit.co/inv_1');
    expect(result.invoiceId).toBe('inv_1');
    expect(result.movie?.title).toBe('The Grand Adventure');
  });

  it('webhook forwards the signature and raw body to payment-service', async () => {
    const seen: unknown[] = [];
    const service = makeService({
      payment: {
        Webhook: ((payload: unknown) => {
          seen.push(payload);
          return of({});
        }) as PaymentServiceStub['Webhook'],
      },
    });

    await service.webhook('tok', '{"id":"inv_1"}');

    expect(seen[0]).toEqual({ signature: 'tok', body: '{"id":"inv_1"}' });
  });

  it('list enriches every item and preserves pagination metadata', async () => {
    const service = makeService({
      booking: {
        List: (() =>
          of({
            items: [bookingDto, { ...bookingDto, id: 'b2' }],
            meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
          })) as BookingServiceStub['List'],
      },
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
    const service = makeService({
      booking: {
        Get: (() => of(bookingDto)) as BookingServiceStub['Get'],
      },
      cinema,
    });

    const result = await service.get(userId, 'b1');
    expect(result.id).toBe('b1');
    expect(result.movie).toBeUndefined();
  });

  it('rethrows RPC errors from booking-service', async () => {
    const service = makeService({
      booking: {
        Cancel: (() =>
          throwError(() => ({
            statusCode: 409,
            message: 'Cannot cancel a confirmed booking',
            error: 'Conflict',
          }))) as BookingServiceStub['Cancel'],
      },
    });

    await expect(service.cancel(userId, 'b1')).rejects.toThrow(
      'Cannot cancel a confirmed booking',
    );
  });

  it('sync-payment asks payment-service then reads the booking projection', async () => {
    const seen: unknown[] = [];
    const service = makeService({
      payment: {
        SyncPaymentStatus: ((payload: unknown) => {
          seen.push(payload);
          return of({
            id: 'p1',
            bookingId: 'b1',
            status: 'PAID',
          });
        }) as PaymentServiceStub['SyncPaymentStatus'],
      },
      booking: {
        Get: (() => of(bookingDto)) as BookingServiceStub['Get'],
      },
    });

    const result = await service.syncPaymentStatus(userId, 'b1');
    expect(seen[0]).toEqual({ bookingId: 'b1' });
    expect(result.id).toBe('b1');
  });
});
