import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { BookingConfirmedData } from '@ticketing/shared';
import { TicketEventsPublisher } from '../events/ticket-events.publisher';
import { BookingEventsConsumer } from './booking-events.consumer';
import { Ticket } from './ticket.entity';
import { TicketsService } from './tickets.service';

function makeRepo(existing: Ticket[] = []) {
  const repo = {
    find: jest.fn().mockResolvedValue(existing),
    findOne: jest.fn().mockResolvedValue(existing[0] ?? null),
    create: jest.fn((data: Partial<Ticket>) => data),
    save: jest.fn((rows: Ticket[]) =>
      Promise.resolve(
        rows.map((row, index) => ({
          ...row,
          id: `t${index + 1}`,
          createdAt: new Date('2026-08-12T14:10:00.000Z'),
        })),
      ),
    ),
    delete: jest.fn(),
  };
  return repo as unknown as Repository<Ticket> & {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    bookingId: 'b1',
    userId: 'u1',
    showtimeId: 'st1',
    code: 'TKT-ABCDEFGH',
    movieTitle: 'The Grand Adventure',
    theaterName: 'Grand Cineplex 1',
    startsAt: new Date('2026-08-20T18:00:00.000Z'),
    seatId: 's1',
    rowLabel: 'A',
    seatNumber: 1,
    createdAt: new Date('2026-08-12T14:10:00.000Z'),
    ...overrides,
  };
}

const issueRequest = {
  bookingId: 'b1',
  userId: 'u1',
  showtimeId: 'st1',
  movieTitle: 'The Grand Adventure',
  theaterName: 'Grand Cineplex 1',
  startsAt: '2026-08-20T18:00:00.000Z',
  seats: [{ seatId: 's1', rowLabel: 'A', seatNumber: 1 }],
};

describe('TicketsService', () => {
  it('issues one ticket per seat', async () => {
    const repo = makeRepo();
    const service = new TicketsService(repo);

    const rows = await service.issue(issueRequest);

    expect(rows).toHaveLength(1);
    expect(rows[0].code).toMatch(/^TKT-[A-Z2-9]{8}$/);
    expect(repo.save).toHaveBeenCalled();
  });

  it('returns existing tickets on a replayed booking.confirmed', async () => {
    const existing = makeTicket();
    const repo = makeRepo([existing]);
    const service = new TicketsService(repo);

    const rows = await service.issue(issueRequest);

    expect(rows).toEqual([existing]);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('looks up a ticket by its bearer code', async () => {
    const repo = makeRepo([makeTicket()]);
    const service = new TicketsService(repo);

    const result = await service.getByCode('TKT-ABCDEFGH');

    expect(result).toEqual(
      expect.objectContaining({
        code: 'TKT-ABCDEFGH',
        row: 'A',
        number: 1,
        movieTitle: 'The Grand Adventure',
      }),
    );
  });

  it('throws NOT_FOUND for an unknown code', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue(null);
    const service = new TicketsService(repo);

    await expect(service.getByCode('TKT-NOPE')).rejects.toBeInstanceOf(
      RpcException,
    );
  });

  it('void is idempotent and deletes by booking id', async () => {
    const repo = makeRepo();
    const service = new TicketsService(repo);

    await service.void('b1');

    expect(repo.delete).toHaveBeenCalledWith({ bookingId: 'b1' });
  });
});

describe('BookingEventsConsumer', () => {
  it('issues tickets and publishes tickets.issued', async () => {
    const ticket = makeTicket();
    const tickets = {
      issue: jest.fn().mockResolvedValue([ticket]),
    } as unknown as TicketsService;
    const events = {
      issued: jest.fn().mockResolvedValue(undefined),
      voided: jest.fn().mockResolvedValue(undefined),
    } as unknown as TicketEventsPublisher & {
      issued: jest.Mock;
      voided: jest.Mock;
    };
    const consumer = new BookingEventsConsumer(tickets, events);

    const event: BookingConfirmedData = {
      recipient: { to: 'user@example.com', name: 'Ada' },
      bookingId: 'b1',
      userId: 'u1',
      showtimeId: 'st1',
      totalAmount: 100000,
      currency: 'IDR',
      movieTitle: 'The Grand Adventure',
      theaterName: 'Grand Cineplex 1',
      startsAt: '2026-08-20T18:00:00.000Z',
      seats: [
        {
          seatId: 's1',
          rowLabel: 'A',
          seatNumber: 1,
          category: 'REGULAR',
          priceAmount: 100000,
          priceCurrency: 'IDR',
        },
      ],
      confirmedAt: '2026-08-12T14:10:00.000Z',
    };

    await consumer.onConfirmed(event);

    expect(tickets.issue).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1' }),
    );
    expect(events.issued).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b1',
        tickets: [expect.objectContaining({ code: 'TKT-ABCDEFGH' })],
      }),
    );
  });

  it('voids tickets on booking.refunded', async () => {
    const tickets = {
      void: jest.fn().mockResolvedValue(undefined),
    } as unknown as TicketsService;
    const events = {
      issued: jest.fn(),
      voided: jest.fn().mockResolvedValue(undefined),
    } as unknown as TicketEventsPublisher & {
      issued: jest.Mock;
      voided: jest.Mock;
    };
    const consumer = new BookingEventsConsumer(tickets, events);

    await consumer.onRefunded({ bookingId: 'b1', userId: 'u1' });

    expect(tickets.void).toHaveBeenCalledWith('b1');
    expect(events.voided).toHaveBeenCalledWith({ bookingId: 'b1' });
  });
});
