import {
  MovieDto,
  MovieSummary,
  Money,
  PaginatedMovies,
  PaginatedShowtimes,
  PaginatedTheaters,
  PaginationMeta,
  SeatDto,
  ShowtimeDto,
  ShowtimeSummary,
  TheaterDto,
  TheaterSummary,
} from '@ticketing/shared';
import { Movie } from '../movies/movie.entity';
import { Showtime } from '../movies/showtime.entity';
import { SeatCategory } from '@ticketing/shared';
import { Seat } from '../theaters/seat.entity';
import { Theater } from '../theaters/theater.entity';

export interface Layout {
  rows: number;
  cols: number;
}

export function toMovieDto(movie: Movie): MovieDto {
  return {
    id: movie.id,
    title: movie.title,
    synopsis: movie.synopsis,
    genres: (movie.genres ?? []).map((g) => g.name),
    durationMinutes: movie.durationMinutes,
    ageRating: movie.ageRating as MovieDto['ageRating'],
    posterUrl: movie.posterUrl,
    releaseDate: movie.releaseDate,
    status: movie.status as MovieDto['status'],
    createdAt: movie.createdAt.toISOString(),
    updatedAt: movie.updatedAt.toISOString(),
  };
}

export function toMovieSummary(movie: Movie): MovieSummary {
  return {
    id: movie.id,
    title: movie.title,
    posterUrl: movie.posterUrl,
    ageRating: movie.ageRating as MovieSummary['ageRating'],
    durationMinutes: movie.durationMinutes,
  };
}

export function toSeatDto(seat: Seat): SeatDto {
  return {
    id: seat.id,
    row: seat.rowLabel,
    number: seat.seatNumber,
    category: seat.category as SeatDto['category'],
    isAccessible: seat.isAccessible,
    isDisabled: seat.isDisabled,
  };
}

export function toTheaterDto(theater: Theater): TheaterDto {
  return {
    id: theater.id,
    name: theater.name,
    address: theater.address,
    seats: (theater.seats ?? []).map(toSeatDto),
    createdAt: theater.createdAt.toISOString(),
    updatedAt: theater.updatedAt.toISOString(),
  };
}

export function toTheaterSummary(theater: Theater): TheaterSummary {
  return { id: theater.id, name: theater.name };
}

export function toShowtimeDto(showtime: Showtime): ShowtimeDto {
  return {
    id: showtime.id,
    movie: toMovieSummary(showtime.movie),
    theater: toTheaterSummary(showtime.theater),
    startsAt: showtime.startsAt.toISOString(),
    price: {
      amount: Number(showtime.priceAmount),
      currency: showtime.priceCurrency as Money['currency'],
    },
    // Cinema owns the static grid; live held/booked seats are tracked by
    // ticket-service. Here we expose total capacity as an upper bound.
    availableSeats: computeSeatCount(showtime.theater),
    createdAt: showtime.createdAt.toISOString(),
    updatedAt: showtime.updatedAt.toISOString(),
  };
}

export function toShowtimeSummary(showtime: Showtime): ShowtimeSummary {
  return {
    id: showtime.id,
    startsAt: showtime.startsAt.toISOString(),
    price: {
      amount: Number(showtime.priceAmount),
      currency: showtime.priceCurrency as Money['currency'],
    },
  };
}

function computeSeatCount(theater: Theater): number {
  return (theater.seats ?? []).filter((s) => !s.isDisabled).length;
}

function rowLetter(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

function categoryForRowCol(
  rowIndex: number,
  colIndex: number,
  rows: number,
  cols: number,
): SeatCategory {
  const isLastRow = rowIndex === rows - 1;
  const isLastTwoSeat = colIndex >= cols - 2;
  if (isLastRow || isLastTwoSeat) {
    return 'COUPLE';
  }
  const backQuarterStart = Math.floor(rows * 0.75);
  if (rowIndex >= backQuarterStart) {
    return 'VIP';
  }
  return 'REGULAR';
}

export function generateSeatGrid(layout: Layout, theaterId: string): Seat[] {
  const { rows, cols } = layout;
  const seats: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      seats.push({
        id: undefined as unknown as string,
        theater: { id: theaterId } as Theater,
        rowLabel: rowLetter(r),
        seatNumber: c + 1,
        category: categoryForRowCol(r, c, rows, cols),
        isAccessible: false,
        isDisabled: false,
      });
    }
  }
  return seats;
}

export function buildMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function paginate<T>(items: T[], meta: PaginationMeta) {
  return { items, meta };
}

export function paginatedMovies(
  items: Movie[],
  meta: PaginationMeta,
): PaginatedMovies {
  return { items: items.map(toMovieDto), meta };
}

export function paginatedTheaters(
  items: Theater[],
  meta: PaginationMeta,
): PaginatedTheaters {
  return { items: items.map(toTheaterDto), meta };
}

export function paginatedShowtimes(
  items: Showtime[],
  meta: PaginationMeta,
): PaginatedShowtimes {
  return { items: items.map(toShowtimeDto), meta };
}
