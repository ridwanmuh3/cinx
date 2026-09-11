import { useAuthStore } from '@/stores/auth';
import type {
  Booking,
  HoldResponse,
  LoginResponse,
  Money,
  Movie,
  MovieCreateRequest,
  Paginated,
  PayResponse,
  SeatMap,
  Showtime,
  Theater,
  User,
} from '@/types';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly conflictSeatIds?: string[];

  constructor(message: string, statusCode: number, conflictSeatIds?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.conflictSeatIds = conflictSeatIds;
  }
}

function buildQuery(params?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = useAuthStore();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (init.body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let body: {
      message?: string | string[];
      error?: string;
      statusCode?: number;
      conflictSeatIds?: string[];
    } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON error body */
    }
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : (body.message ?? body.error ?? `Request failed (${res.status})`);
    throw new ApiError(message, body.statusCode ?? res.status, body.conflictSeatIds);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- auth ----------

export function register(dto: { email: string; password: string; name?: string }): Promise<User> {
  return request<User>('/auth/register', { method: 'POST', body: JSON.stringify(dto) });
}

export function login(dto: { email: string; password: string }): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(dto) });
}

export function me(): Promise<User> {
  return request<User>('/auth/me');
}

// ---------- movies ----------

export function listMovies(params?: {
  page?: number;
  limit?: number;
  q?: string;
  genre?: string;
  nowPlaying?: boolean;
}): Promise<Paginated<Movie>> {
  return request<Paginated<Movie>>(`/movies${buildQuery(params)}`);
}

export function getMovie(id: string): Promise<Movie> {
  return request<Movie>(`/movies/${id}`);
}

export function createMovie(dto: MovieCreateRequest): Promise<Movie> {
  return request<Movie>('/movies', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateMovie(id: string, dto: Partial<MovieCreateRequest>): Promise<Movie> {
  return request<Movie>(`/movies/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function deleteMovie(id: string): Promise<void> {
  return request<void>(`/movies/${id}`, { method: 'DELETE' });
}

// ---------- theaters ----------

export function listTheaters(params?: {
  page?: number;
  limit?: number;
}): Promise<Paginated<Theater>> {
  return request<Paginated<Theater>>(`/theaters${buildQuery(params)}`);
}

export function getTheater(id: string): Promise<Theater> {
  return request<Theater>(`/theaters/${id}`);
}

export function createTheater(dto: {
  name: string;
  address: string;
  layout: { rows: number; cols: number };
}): Promise<Theater> {
  return request<Theater>('/theaters', { method: 'POST', body: JSON.stringify(dto) });
}

export function deleteTheater(id: string): Promise<void> {
  return request<void>(`/theaters/${id}`, { method: 'DELETE' });
}

// ---------- showtimes ----------

export function listShowtimes(params?: {
  page?: number;
  limit?: number;
  movieId?: string;
  theaterId?: string;
}): Promise<Paginated<Showtime>> {
  return request<Paginated<Showtime>>(`/showtimes${buildQuery(params)}`);
}

export function getShowtime(id: string): Promise<Showtime> {
  return request<Showtime>(`/showtimes/${id}`);
}

export function getSeatMap(showtimeId: string): Promise<SeatMap> {
  return request<SeatMap>(`/showtimes/${showtimeId}/seats`).then(normalizeSeatMap);
}

export function createShowtime(dto: {
  movieId: string;
  theaterId: string;
  startsAt: string;
  price: Money;
}): Promise<Showtime> {
  return request<Showtime>('/showtimes', { method: 'POST', body: JSON.stringify(dto) });
}

export function deleteShowtime(id: string): Promise<void> {
  return request<void>(`/showtimes/${id}`, { method: 'DELETE' });
}

// ---------- bookings ----------

export function hold(dto: { showtimeId: string; seatIds: string[] }): Promise<HoldResponse> {
  return request<HoldResponse>('/bookings/holds', { method: 'POST', body: JSON.stringify(dto) });
}

export function listBookings(params?: {
  page?: number;
  limit?: number;
}): Promise<Paginated<Booking>> {
  return request<Paginated<Booking>>(`/bookings${buildQuery(params)}`);
}

export function getBooking(id: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}`);
}

export function pay(id: string, returnUrl?: string): Promise<PayResponse> {
  return request<PayResponse>(`/bookings/${id}/pay`, {
    method: 'POST',
    body: JSON.stringify({ returnUrl }),
  });
}

export function cancelBooking(id: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

/** Server-side payment sync: the backend checks the invoice status directly
 *  with Xendit and confirms/cancels the booking accordingly. */
export function syncPayment(id: string): Promise<Booking> {
  return request<Booking>(`/bookings/${id}/sync-payment`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Defensive normalisation: older/broken payloads may omit `status` or use
 *  `rowLabel` instead of `row`. Missing status is treated as AVAILABLE. */
function normalizeSeatMap(raw: SeatMap): SeatMap {
  return {
    ...raw,
    seats: (raw.seats ?? []).map((seat) => ({
      ...seat,
      row: seat.row ?? (seat as unknown as { rowLabel?: string }).rowLabel ?? '',
      status: seat.status ?? 'AVAILABLE',
    })),
  };
}
