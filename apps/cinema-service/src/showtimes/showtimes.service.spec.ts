import { mock } from 'jest-mock-extended';
import { Repository } from 'typeorm';
import { ShowtimeCreateRequest } from '@ticketing/shared';
import { RpcException } from '@nestjs/microservices';
import { Movie } from '../movies/movie.entity';
import { Showtime } from '../movies/showtime.entity';
import { endOf, overlaps, ShowtimesService } from './showtimes.service';

describe('overlap primitives', () => {
  it('overlaps true when intervals intersect', () => {
    const s = new Date('2026-08-20T18:00:00Z');
    const e = new Date('2026-08-20T20:00:00Z');
    const other = new Date('2026-08-20T19:00:00Z');
    const otherEnd = new Date('2026-08-20T21:00:00Z');
    expect(overlaps(s, e, other, otherEnd)).toBe(true);
  });

  it('overlaps false for disjoint intervals', () => {
    const s = new Date('2026-08-20T18:00:00Z');
    const e = new Date('2026-08-20T20:00:00Z');
    const other = new Date('2026-08-20T20:30:00Z');
    const otherEnd = new Date('2026-08-20T22:00:00Z');
    expect(overlaps(s, e, other, otherEnd)).toBe(false);
  });

  it('overlaps false for back-to-back intervals (adjacent, half-open)', () => {
    const s = new Date('2026-08-20T18:00:00Z');
    const e = new Date('2026-08-20T20:00:00Z');
    const other = new Date('2026-08-20T20:00:00Z');
    const otherEnd = new Date('2026-08-20T22:00:00Z');
    expect(overlaps(s, e, other, otherEnd)).toBe(false);
  });

  it('endOf computes start + duration minutes', () => {
    const start = new Date('2026-08-20T18:00:00Z');
    const end = endOf(start, 128);
    expect(end.getTime()).toBe(start.getTime() + 128 * 60_000);
  });
});

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
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

describe('ShowtimesService.create', () => {
  const repo = mock<Repository<Showtime>>();
  const movies = mock<Repository<Movie>>();
  let service: ShowtimesService;

  const movie = { id: 'm1', durationMinutes: 120 } as Movie;

  const baseRequest: ShowtimeCreateRequest = {
    movieId: 'm1',
    theaterId: 't1',
    startsAt: '2026-08-20T18:00:00Z',
    price: { amount: 50000, currency: 'IDR' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ShowtimesService(repo, movies);
    movies.findOne.mockResolvedValue(movie);
  });

  it('rejects with 404 when the movie does not exist', async () => {
    movies.findOne.mockResolvedValue(null);
    await expectStatus(service.create(baseRequest), 404);
  });

  it('rejects with 409 when an overlapping showtime exists', async () => {
    const existing = {
      id: 's-existing',
      startsAt: new Date('2026-08-20T17:30:00Z'),
      movie: { durationMinutes: 120 },
    } as Showtime;
    repo.find.mockResolvedValue([existing]);

    await expectStatus(service.create(baseRequest), 409);
  });

  it('creates a showtime when there is no overlap', async () => {
    repo.find.mockResolvedValue([]);
    const saved = {
      id: 's1',
      startsAt: new Date(baseRequest.startsAt),
      createdAt: new Date('2026-08-20T17:00:00Z'),
      updatedAt: new Date('2026-08-20T17:00:00Z'),
      movie,
      theater: { id: 't1', seats: [{ isDisabled: false }] },
    } as unknown as Showtime;
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);
    repo.findOneOrFail.mockResolvedValue(saved);

    const result = await service.create(baseRequest);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date(baseRequest.startsAt),
        priceAmount: 50000,
        priceCurrency: 'IDR',
      }),
    );
    expect(result.id).toBe('s1');
  });
});
