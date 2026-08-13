import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Between, Repository } from 'typeorm';
import {
  ListShowtimesQuery,
  PaginatedShowtimes,
  PaginationMeta,
  ShowtimeCreateRequest,
  ShowtimeDto,
  ShowtimeSeatMap,
  ShowtimeUpdateRequest,
  rpcErrorPayload,
} from '@ticketing/shared';
import { Showtime } from '../movies/showtime.entity';
import { Movie } from '../movies/movie.entity';
import { Theater } from '../theaters/theater.entity';
import { buildMeta, toShowtimeDto } from '../cinema/mappers';

export const OVERLAP_WINDOW_MIN = 240;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function endOf(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + durationMinutes * 60_000);
}

/** Two intervals [a.start, a.end) and [b.start, b.end) overlap iff
    a.start < b.end AND b.start < a.end. */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

@Injectable()
export class ShowtimesService {
  constructor(
    @InjectRepository(Showtime)
    private readonly showtimes: Repository<Showtime>,
    @InjectRepository(Movie)
    private readonly movies: Repository<Movie>,
  ) {}

  async list(query: ListShowtimesQuery): Promise<PaginatedShowtimes> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(query.limit) || DEFAULT_LIMIT),
    );
    const skip = (page - 1) * limit;

    const qb = this.showtimes
      .createQueryBuilder('showtime')
      .leftJoinAndSelect('showtime.movie', 'movie')
      .leftJoinAndSelect('showtime.theater', 'theater')
      .leftJoinAndSelect('theater.seats', 'seats');

    if (query.movieId) {
      qb.andWhere('showtime.movieId = :movieId', { movieId: query.movieId });
    }
    if (query.theaterId) {
      qb.andWhere('showtime.theaterId = :theaterId', {
        theaterId: query.theaterId,
      });
    }
    if (query.from) {
      qb.andWhere('showtime.startsAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('showtime.startsAt <= :to', { to: new Date(query.to) });
    }

    const [items, total] = await qb
      .orderBy('showtime.startsAt', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const meta: PaginationMeta = buildMeta(page, limit, total);
    return { items: items.map(toShowtimeDto), meta };
  }

  async create(dto: ShowtimeCreateRequest): Promise<ShowtimeDto> {
    const movie = await this.mustFindMovie(dto.movieId);
    const startsAt = new Date(dto.startsAt);

    await this.assertNoOverlap(dto.theaterId, undefined, startsAt, movie);

    const showtime = this.showtimes.create({
      movie: { id: dto.movieId } as Movie,
      theater: { id: dto.theaterId } as unknown as Theater,
      startsAt,
      priceAmount: dto.price.amount,
      priceCurrency: dto.price.currency,
    });
    const saved = await this.showtimes.save(showtime);
    return toShowtimeDto(await this.reload(saved.id));
  }

  async update(id: string, dto: ShowtimeUpdateRequest): Promise<ShowtimeDto> {
    const showtime = await this.mustFindShowtime(id);
    const movie = dto.movieId
      ? await this.mustFindMovie(dto.movieId)
      : showtime.movie;

    if (dto.startsAt || dto.movieId) {
      const startsAt = dto.startsAt
        ? new Date(dto.startsAt)
        : showtime.startsAt;
      await this.assertNoOverlap(
        dto.theaterId ?? showtime.theater.id,
        id,
        startsAt,
        movie,
      );
    }

    if (dto.movieId) showtime.movie = { id: dto.movieId } as Movie;
    if (dto.theaterId)
      showtime.theater = { id: dto.theaterId } as unknown as Theater;
    if (dto.startsAt) showtime.startsAt = new Date(dto.startsAt);
    if (dto.price) {
      showtime.priceAmount = dto.price.amount;
      showtime.priceCurrency = dto.price.currency;
    }

    const saved = await this.showtimes.save(showtime);
    return toShowtimeDto(await this.reload(saved.id));
  }

  async remove(id: string): Promise<{ id: string }> {
    const showtime = await this.mustFindShowtime(id);
    await this.showtimes.remove(showtime);
    return { id };
  }

  async one(id: string): Promise<ShowtimeDto> {
    const showtime = await this.mustFindShowtime(id);
    return toShowtimeDto(await this.reload(showtime.id));
  }

  private async loadShowtimeWithSeats(id: string): Promise<Showtime> {
    return this.showtimes.findOneOrFail({
      where: { id },
      relations: { movie: true, theater: { seats: true } },
    });
  }

  async seatMap(id: string): Promise<ShowtimeSeatMap> {
    const showtime = await this.loadShowtimeWithSeats(id);
    if (!showtime.theater?.seats) {
      throw new RpcException(rpcErrorPayload(404, 'Showtime not found'));
    }
    return {
      showtimeId: showtime.id,
      movieId: showtime.movie.id,
      movieTitle: showtime.movie.title,
      posterUrl: showtime.movie.posterUrl,
      ageRating: showtime.movie.ageRating,
      durationMinutes: showtime.movie.durationMinutes,
      theaterId: showtime.theater.id,
      theaterName: showtime.theater.name,
      startsAt: showtime.startsAt.toISOString(),
      price: {
        amount: Number(showtime.priceAmount),
        currency: showtime.priceCurrency as 'IDR',
      },
      seats: showtime.theater.seats.map((s) => ({
        id: s.id,
        rowLabel: s.rowLabel,
        number: s.seatNumber,
        category: s.category,
        isAccessible: s.isAccessible,
        isDisabled: s.isDisabled,
      })),
    };
  }

  private async mustFindMovie(id: string): Promise<Movie> {
    const movie = await this.movies.findOne({ where: { id } });
    if (!movie) {
      throw new RpcException(rpcErrorPayload(404, 'Movie not found'));
    }
    return movie;
  }

  private async mustFindShowtime(id: string): Promise<Showtime> {
    const showtime = await this.showtimes.findOne({
      where: { id },
      relations: { movie: true, theater: { seats: true } },
    });
    if (!showtime) {
      throw new RpcException(rpcErrorPayload(404, 'Showtime not found'));
    }
    return showtime;
  }

  private async assertNoOverlap(
    theaterId: string,
    excludeId: string | undefined,
    startsAt: Date,
    movie: Movie,
  ): Promise<void> {
    const newEnd = endOf(startsAt, movie.durationMinutes);
    const windowStart = new Date(
      startsAt.getTime() - OVERLAP_WINDOW_MIN * 60_000,
    );

    const candidates = await this.showtimes.find({
      where: {
        theater: { id: theaterId },
        startsAt: Between(windowStart, newEnd),
      },
      relations: { movie: true },
    });

    for (const c of candidates) {
      if (c.id === excludeId) continue;
      const cEnd = endOf(c.startsAt, c.movie.durationMinutes);
      if (overlaps(startsAt, newEnd, c.startsAt, cEnd)) {
        throw new RpcException(
          rpcErrorPayload(
            409,
            'Theater already has a showtime overlapping this slot',
          ),
        );
      }
    }
  }

  private async reload(id: string): Promise<Showtime> {
    return this.showtimes.findOneOrFail({
      where: { id },
      relations: { movie: true, theater: { seats: true } },
    });
  }
}
