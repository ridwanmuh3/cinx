import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  Booking,
  HoldResponse,
  LoginResponse,
  MockSimulation,
  Money,
  Movie,
  MovieCreateRequest,
  Paginated,
  SeatMap,
  Showtime,
  Theater,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';

  // auth
  register(dto: { email: string; password: string; name?: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/auth/register`, dto);
  }
  login(dto: { email: string; password: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, dto);
  }
  me(): Observable<any> {
    return this.http.get<any>(`${this.base}/auth/me`);
  }

  // movies
  listMovies(params?: {
    page?: number;
    limit?: number;
    q?: string;
    genre?: string;
    nowPlaying?: boolean;
  }): Observable<Paginated<Movie>> {
    return this.http.get<Paginated<Movie>>(`${this.base}/movies`, {
      params: buildParams(params),
    });
  }
  getMovie(id: string): Observable<Movie> {
    return this.http.get<Movie>(`${this.base}/movies/${id}`);
  }
  createMovie(dto: MovieCreateRequest): Observable<Movie> {
    return this.http.post<Movie>(`${this.base}/movies`, dto);
  }
  updateMovie(id: string, dto: Partial<MovieCreateRequest>): Observable<Movie> {
    return this.http.patch<Movie>(`${this.base}/movies/${id}`, dto);
  }
  deleteMovie(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/movies/${id}`);
  }

  // theaters
  listTheaters(params?: { page?: number; limit?: number }): Observable<Paginated<Theater>> {
    return this.http.get<Paginated<Theater>>(`${this.base}/theaters`, {
      params: buildParams(params),
    });
  }
  getTheater(id: string): Observable<Theater> {
    return this.http.get<Theater>(`${this.base}/theaters/${id}`);
  }
  createTheater(dto: {
    name: string;
    address: string;
    layout: { rows: number; cols: number };
  }): Observable<Theater> {
    return this.http.post<Theater>(`${this.base}/theaters`, dto);
  }
  deleteTheater(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/theaters/${id}`);
  }

  // showtimes
  listShowtimes(params?: {
    page?: number;
    limit?: number;
    movieId?: string;
    theaterId?: string;
  }): Observable<Paginated<Showtime>> {
    return this.http.get<Paginated<Showtime>>(`${this.base}/showtimes`, {
      params: buildParams(params),
    });
  }
  getShowtime(id: string): Observable<Showtime> {
    return this.http.get<Showtime>(`${this.base}/showtimes/${id}`);
  }
  getSeatMap(showtimeId: string): Observable<SeatMap> {
    return this.http
      .get<SeatMap>(`${this.base}/showtimes/${showtimeId}/seats`)
      .pipe(map(normalizeSeatMap));
  }
  createShowtime(dto: {
    movieId: string;
    theaterId: string;
    startsAt: string;
    price: Money;
  }): Observable<Showtime> {
    return this.http.post<Showtime>(`${this.base}/showtimes`, dto);
  }
  deleteShowtime(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/showtimes/${id}`);
  }

  // bookings
  hold(dto: { showtimeId: string; seatIds: string[] }): Observable<HoldResponse> {
    return this.http.post<HoldResponse>(`${this.base}/bookings/holds`, dto);
  }
  listBookings(params?: { page?: number; limit?: number }): Observable<Paginated<Booking>> {
    return this.http.get<Paginated<Booking>>(`${this.base}/bookings`, {
      params: buildParams(params),
    });
  }
  getBooking(id: string): Observable<Booking> {
    return this.http.get<Booking>(`${this.base}/bookings/${id}`);
  }
  pay(id: string, simulate?: MockSimulation): Observable<Booking> {
    return this.http.post<Booking>(`${this.base}/bookings/${id}/pay`, {
      paymentMethod: 'MOCK',
      simulate,
    });
  }
  cancelBooking(id: string): Observable<Booking> {
    return this.http.post<Booking>(`${this.base}/bookings/${id}/cancel`, {});
  }
}

function buildParams(params?: Record<string, unknown>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
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
