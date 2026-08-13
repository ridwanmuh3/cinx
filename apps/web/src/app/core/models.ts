export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

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

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export type AgeRating = 'SU' | 'BO' | '13+' | '17+' | '21+';
export type MovieStatus = 'NOW_SHOWING' | 'COMING_SOON' | 'ENDED';
export type SeatCategory = 'REGULAR' | 'VIP' | 'COUPLE';
export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface Movie {
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

export interface MovieSummary {
  id: string;
  title: string;
  posterUrl: string | null;
  ageRating: AgeRating;
  durationMinutes: number;
}

export interface TheaterSummary {
  id: string;
  name: string;
}

export interface Theater {
  id: string;
  name: string;
  address: string;
  seats: Seat[];
  createdAt: string;
  updatedAt: string;
}

export interface Seat {
  id: string;
  row: string;
  number: number;
  category: SeatCategory;
  isAccessible: boolean;
  isDisabled: boolean;
}

export interface Showtime {
  id: string;
  movie: MovieSummary;
  theater: TheaterSummary;
  startsAt: string;
  price: Money;
  availableSeats: number;
  createdAt: string;
  updatedAt: string;
}

export interface SeatAvailability {
  id: string;
  row: string;
  number: number;
  category: SeatCategory;
  isAccessible: boolean;
  isDisabled: boolean;
  status: SeatStatus;
}

export interface SeatMap {
  showtimeId: string;
  price: Money;
  seats: SeatAvailability[];
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';
export type MockSimulation = 'SUCCESS' | 'FAILURE';

export interface HeldSeat {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: SeatCategory;
  priceAmount: number;
  priceCurrency: 'IDR';
}

export interface HoldResponse {
  bookingId: string;
  status: BookingStatus;
  expiresAt: string;
  totalAmount: number;
  currency: 'IDR';
  seats: HeldSeat[];
  payment: { providerId: string; method: 'MOCK'; status: PaymentStatus };
}

export interface Ticket {
  id: string;
  bookingId: string;
  code: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  createdAt: string;
}

export interface BookingSeatSnapshot {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: SeatCategory;
  priceAmount: number;
  priceCurrency: 'IDR';
}

export interface Booking {
  id: string;
  userId: string;
  showtimeId: string;
  totalAmount: number;
  currency: 'IDR';
  status: BookingStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  seats: BookingSeatSnapshot[];
  movie?: MovieSummary;
  theater?: TheaterSummary;
  startsAt?: string;
  tickets?: Ticket[];
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  conflictSeatIds?: string[];
}
