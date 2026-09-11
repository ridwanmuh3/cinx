export const CinemaPatterns = {
  PING: 'Ping',
  MOVIES_LIST: 'ListMovies',
  MOVIE_GET: 'GetMovie',
  MOVIE_CREATE: 'CreateMovie',
  MOVIE_UPDATE: 'UpdateMovie',
  MOVIE_DELETE: 'DeleteMovie',
  THEATERS_LIST: 'ListTheaters',
  THEATER_GET: 'GetTheater',
  THEATER_CREATE: 'CreateTheater',
  THEATER_UPDATE: 'UpdateTheater',
  THEATER_DELETE: 'DeleteTheater',
  SHOWTIMES_LIST: 'ListShowtimes',
  SHOWTIME_GET: 'GetShowtime',
  SHOWTIME_CREATE: 'CreateShowtime',
  SHOWTIME_UPDATE: 'UpdateShowtime',
  SHOWTIME_DELETE: 'DeleteShowtime',
  SHOWTIME_SEATS: 'GetSeatMap',
} as const;

export type ObjectId = string;

export interface IdRequest {
  id: string;
}

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
  id?: string;
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

/** Wire shape mirrors the flat CreateTheaterRequest proto message. */
export interface TheaterCreateRequest {
  name: string;
  address: string;
  rows: number;
  cols: number;
}

export interface TheaterUpdateRequest {
  id?: string;
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
  id?: string;
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
