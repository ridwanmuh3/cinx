export const CinemaPatterns = {
  MOVIES_LIST: 'cinema.movies.list',
  MOVIE_GET: 'cinema.movie.get',
  MOVIE_CREATE: 'cinema.movie.create',
  MOVIE_UPDATE: 'cinema.movie.update',
  MOVIE_DELETE: 'cinema.movie.delete',
  THEATERS_LIST: 'cinema.theaters.list',
  THEATER_GET: 'cinema.theater.get',
  THEATER_CREATE: 'cinema.theater.create',
  THEATER_UPDATE: 'cinema.theater.update',
  THEATER_DELETE: 'cinema.theater.delete',
  SHOWTIMES_LIST: 'cinema.showtimes.list',
  SHOWTIME_GET: 'cinema.showtime.get',
  SHOWTIME_CREATE: 'cinema.showtime.create',
  SHOWTIME_UPDATE: 'cinema.showtime.update',
  SHOWTIME_DELETE: 'cinema.showtime.delete',
  SHOWTIME_SEATS: 'cinema.showtime.seats',
} as const;

export type ObjectId = string;

export type AgeRating = 'SU' | 'BO' | '13+' | '17+' | '21+';

export type MovieStatus = 'NOW_SHOWING' | 'COMING_SOON' | 'ENDED';

export type SeatCategory = 'REGULAR' | 'VIP' | 'COUPLE';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface Money {
  amount: number;
  currency: 'IDR';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SeatDto {
  id: string;
  row: string;
  number: number;
  category: SeatCategory;
  isAccessible: boolean;
  isDisabled: boolean;
}

export interface TheaterSummary {
  id: string;
  name: string;
}

export interface ShowtimeSummary {
  id: string;
  startsAt: string;
  price: Money;
}

export interface MovieSummary {
  id: string;
  title: string;
  posterUrl: string | null;
  ageRating: AgeRating;
  durationMinutes: number;
}

export interface MovieDto {
  id: string;
  title: string;
  synopsis: string;
  genres: string[];
  durationMinutes: number;
  ageRating: AgeRating;
  posterUrl: string | null;
  releaseDate: string;
  status: MovieStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MovieCreateRequest {
  title: string;
  synopsis: string;
  genres: string[];
  durationMinutes: number;
  ageRating: AgeRating;
  posterUrl?: string | null;
  releaseDate: string;
  status?: MovieStatus;
}

export interface MovieUpdateRequest {
  title?: string;
  synopsis?: string;
  genres?: string[];
  durationMinutes?: number;
  ageRating?: AgeRating;
  posterUrl?: string | null;
  releaseDate?: string;
  status?: MovieStatus;
}

export interface TheaterDto {
  id: string;
  name: string;
  address: string;
  seats: SeatDto[];
  createdAt: string;
  updatedAt: string;
}

export interface TheaterCreateRequest {
  name: string;
  address: string;
  layout: { rows: number; cols: number };
}

export interface TheaterUpdateRequest {
  name?: string;
  address?: string;
}

export interface ShowtimeDto {
  id: string;
  movie: MovieSummary;
  theater: TheaterSummary;
  startsAt: string;
  price: Money;
  availableSeats: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShowtimeCreateRequest {
  movieId: string;
  theaterId: string;
  startsAt: string;
  price: Money;
}

export interface ShowtimeSeat {
  id: string;
  rowLabel: string;
  number: number;
  category: SeatCategory;
  isAccessible: boolean;
  isDisabled: boolean;
}

export interface ShowtimeSeatMap {
  showtimeId: string;
  movieId: string;
  movieTitle: string;
  posterUrl: string | null;
  ageRating: AgeRating;
  durationMinutes: number;
  theaterId: string;
  theaterName: string;
  startsAt: string;
  price: Money;
  seats: ShowtimeSeat[];
}

export interface ShowtimeUpdateRequest {
  movieId?: string;
  theaterId?: string;
  startsAt?: string;
  price?: Money;
}

export interface PaginatedMovies {
  items: MovieDto[];
  meta: PaginationMeta;
}

export interface PaginatedTheaters {
  items: TheaterDto[];
  meta: PaginationMeta;
}

export interface PaginatedShowtimes {
  items: ShowtimeDto[];
  meta: PaginationMeta;
}

export interface ListMoviesQuery {
  page?: number;
  limit?: number;
  q?: string;
  genre?: string;
  nowPlaying?: boolean;
}

export interface ListShowtimesQuery {
  page?: number;
  limit?: number;
  movieId?: string;
  theaterId?: string;
  from?: string;
  to?: string;
}

export interface ListQuery {
  page?: number;
  limit?: number;
}

export type CreateMovieRequest = MovieCreateRequest;
export type UpdateMovieRequest = MovieUpdateRequest;
export type CreateTheaterRequest = TheaterCreateRequest;
export type UpdateTheaterRequest = TheaterUpdateRequest;
export type CreateShowtimeRequest = ShowtimeCreateRequest;
export type UpdateShowtimeRequest = ShowtimeUpdateRequest;
