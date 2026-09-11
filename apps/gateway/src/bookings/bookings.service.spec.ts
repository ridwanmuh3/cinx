import { ClientGrpc } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { TicketServiceStub } from '@ticketing/shared';
import { CinemaService } from '../cinema/cinema.service';
import { BookingsService } from './bookings.service';

function grpcClient(stub: Partial<TicketServiceStub>): ClientGrpc {
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
    stub: Partial<TicketServiceStub>,
    cinema?: CinemaService,
  ) {
    return new BookingsService(
      grpcClient(stub),
      cinema ??
        ({
          getShowtime: jest.fn().mockResolvedValue(showtimeDto),
        } as unknown as CinemaService),
    );
  }

  it('pay creates a Xendit invoice and returns its checkout URL', async () => {
    const charge = {
      providerId: 'cix-b1',
      paid: false,
      providerTxnId: null,
      paidAt: null,
      receiptUrl: null,
      checkoutUrl: 'https://checkout.xendit.co/inv_1',
      invoiceId: 'inv_1',
      method: 'XENDIT' as const,
    };
    const chargeArg: unknown[] = [];
    const service = makeService({
      Charge: ((payload: unknown) => {
        chargeArg.push(payload);
        return of(charge);
      }) as TicketServiceStub['Charge'],
      Get: (() => of(bookingDto)) as TicketServiceStub['Get'],
    });

    const result = await service.pay(userId, 'b1', {});

    expect(chargeArg[0]).toEqual({
      bookingId: 'b1',
      userId,
      returnUrl: '',
      payerEmail: '',
    });
    expect(result.checkoutUrl).toBe('https://checkout.xendit.co/inv_1');
    expect(result.invoiceId).toBe('inv_1');
    expect(result.movie?.title).toBe('The Grand Adventure');
  });

  it('webhook forwards the signature and raw body', async () => {
    const seen: unknown[] = [];
    const service = makeService({
      Webhook: ((payload: unknown) => {
        seen.push(payload);
        return of({});
      }) as TicketServiceStub['Webhook'],
    });

    await service.webhook('tok', '{"id":"inv_1"}');

    expect(seen[0]).toEqual({ signature: 'tok', body: '{"id":"inv_1"}' });
  });

  it('list enriches every item and preserves pagination metadata', async () => {
    const service = makeService({
      List: (() =>
        of({
          items: [bookingDto, { ...bookingDto, id: 'b2' }],
          meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
        })) as TicketServiceStub['List'],
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
        Get: (() => of(bookingDto)) as TicketServiceStub['Get'],
      },
      cinema,
    );

    const result = await service.get(userId, 'b1');
    expect(result.id).toBe('b1');
    expect(result.movie).toBeUndefined();
  });

  it('rethrows RPC errors from the ticket service', async () => {
    const service = makeService({
      Cancel: (() =>
        throwError(() => ({
          statusCode: 409,
          message: 'Cannot cancel a confirmed booking',
          error: 'Conflict',
        }))) as TicketServiceStub['Cancel'],
    });

    await expect(service.cancel(userId, 'b1')).rejects.toThrow(
      'Cannot cancel a confirmed booking',
    );
  });
});
