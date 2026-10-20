import { Observable } from 'rxjs';
import {
  UserDto,
  LoginResponse,
  RegisterRequest,
  LoginRequest,
  MeRequest,
  UserContactDto,
  MovieDto,
  TheaterDto,
  ShowtimeDto,
  ShowtimeSeatMap,
  PaginatedMovies,
  PaginatedTheaters,
  PaginatedShowtimes,
  MovieCreateRequest,
  MovieUpdateRequest,
  TheaterCreateRequest,
  TheaterUpdateRequest,
  ShowtimeCreateRequest,
  ShowtimeUpdateRequest,
  ListQuery,
  ListMoviesQuery,
  ListShowtimesQuery,
  IdRequest,
  HoldSeatsRequest,
  HoldResponse,
  BookingDto,
  PaginatedBookings,
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingGetRequest,
  BookingCancelRequest,
  BookingListRequest,
  ChargeContext,
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentWebhookRequest,
  PaymentSyncRequest,
  PaymentGetRequest,
  PaymentDto,
  TicketList,
  TicketListRequest,
  TicketLookupDto,
  TicketIssueRequest,
  VoidTicketsRequest,
} from './contracts';
import { HealthResponse } from './contracts/health';
import { Empty } from './contracts/empty';

export interface UserServiceStub {
  Register(req: RegisterRequest): Observable<UserDto>;
  Login(req: LoginRequest): Observable<LoginResponse>;
  Me(req: MeRequest): Observable<UserDto>;
  Get(req: { userId: string }): Observable<UserContactDto>;
  Ping(req: Empty): Observable<HealthResponse>;
}

export interface CinemaServiceStub {
  Ping(req: Empty): Observable<HealthResponse>;
  ListMovies(req: ListMoviesQuery): Observable<PaginatedMovies>;
  GetMovie(req: IdRequest): Observable<MovieDto>;
  CreateMovie(req: MovieCreateRequest): Observable<MovieDto>;
  UpdateMovie(req: MovieUpdateRequest): Observable<MovieDto>;
  DeleteMovie(req: IdRequest): Observable<Empty>;
  ListTheaters(req: ListQuery): Observable<PaginatedTheaters>;
  GetTheater(req: IdRequest): Observable<TheaterDto>;
  CreateTheater(req: TheaterCreateRequest): Observable<TheaterDto>;
  UpdateTheater(req: TheaterUpdateRequest): Observable<TheaterDto>;
  DeleteTheater(req: IdRequest): Observable<Empty>;
  ListShowtimes(req: ListShowtimesQuery): Observable<PaginatedShowtimes>;
  GetShowtime(req: IdRequest): Observable<ShowtimeDto>;
  CreateShowtime(req: ShowtimeCreateRequest): Observable<ShowtimeDto>;
  UpdateShowtime(req: ShowtimeUpdateRequest): Observable<ShowtimeDto>;
  DeleteShowtime(req: IdRequest): Observable<Empty>;
  GetSeatMap(req: IdRequest): Observable<ShowtimeSeatMap>;
}

export interface BookingServiceStub {
  Ping(req: Empty): Observable<HealthResponse>;
  Hold(req: HoldSeatsRequest): Observable<HoldResponse>;
  Cancel(req: BookingCancelRequest): Observable<BookingDto>;
  Get(req: BookingGetRequest): Observable<BookingDto>;
  List(req: BookingListRequest): Observable<PaginatedBookings>;
  Availability(
    req: BookingAvailabilityRequest,
  ): Observable<BookingAvailabilityResponse>;
  PrepareCharge(req: BookingGetRequest): Observable<ChargeContext>;
}

export interface PaymentServiceStub {
  Ping(req: Empty): Observable<HealthResponse>;
  Charge(req: PaymentChargeRequest): Observable<PaymentChargeResponse>;
  Webhook(req: PaymentWebhookRequest): Observable<Empty>;
  SyncPaymentStatus(req: PaymentSyncRequest): Observable<PaymentDto>;
  Get(req: PaymentGetRequest): Observable<PaymentDto>;
}

export interface TicketServiceStub {
  Ping(req: Empty): Observable<HealthResponse>;
  ListTickets(req: TicketListRequest): Observable<TicketList>;
  GetTicketByCode(req: { code: string }): Observable<TicketLookupDto>;
  IssueTickets(req: TicketIssueRequest): Observable<TicketList>;
  VoidTickets(req: VoidTicketsRequest): Observable<Empty>;
}
