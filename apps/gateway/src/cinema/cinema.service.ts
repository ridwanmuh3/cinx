import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  grpcSend,
  ListMoviesQuery,
  ListShowtimesQuery,
  CinemaServiceStub,
  MovieCreateRequest,
  MovieDto,
  MovieUpdateRequest,
  PaginatedMovies,
  PaginatedShowtimes,
  PaginatedTheaters,
  SeatAvailabilityStatus,
  SERVICE_NAMES,
  ShowtimeCreateRequest,
  ShowtimeDto,
  ShowtimeSeatMap,
  ShowtimeUpdateRequest,
  TheaterCreateRequest,
  TheaterDto,
  TheaterUpdateRequest,
  TicketServiceStub,
} from '@ticketing/shared';

export interface GatewaySeat {
  id: string;
  row: string;
  number: number;
  category: ShowtimeSeatMap['seats'][number]['category'];
  isAccessible: boolean;
  isDisabled: boolean;
  status: SeatAvailabilityStatus;
}

export interface GatewaySeatMap {
  showtimeId: string;
  price: ShowtimeSeatMap['price'];
  seats: GatewaySeat[];
}

@Injectable()
export class CinemaService {
  private readonly cinema: CinemaServiceStub;
  private readonly ticket: TicketServiceStub;

  constructor(
    @Inject(SERVICE_NAMES.CINEMA) cinemaClient: ClientGrpc,
    @Inject(SERVICE_NAMES.TICKET) ticketClient: ClientGrpc,
  ) {
    this.cinema = cinemaClient.getService<CinemaServiceStub>('CinemaService');
    this.ticket = ticketClient.getService<TicketServiceStub>('TicketService');
  }

  listMovies(q: ListMoviesQuery): Promise<PaginatedMovies> {
    return grpcSend(this.cinema.ListMovies(q));
  }

  getMovie(id: string): Promise<MovieDto> {
    return grpcSend(this.cinema.GetMovie({ id }));
  }

  createMovie(dto: MovieCreateRequest): Promise<MovieDto> {
    return grpcSend(this.cinema.CreateMovie(dto));
  }

  updateMovie(id: string, dto: MovieUpdateRequest): Promise<MovieDto> {
    return grpcSend(this.cinema.UpdateMovie({ id, ...dto }));
  }

  deleteMovie(id: string): Promise<void> {
    return grpcSend(this.cinema.DeleteMovie({ id })).then(() => undefined);
  }

  listTheaters(q: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedTheaters> {
    return grpcSend(this.cinema.ListTheaters(q));
  }

  getTheater(id: string): Promise<TheaterDto> {
    return grpcSend(this.cinema.GetTheater({ id }));
  }

  createTheater(
    dto: Omit<TheaterCreateRequest, 'rows' | 'cols'> & {
      layout?: { rows: number; cols: number };
      rows?: number;
      cols?: number;
    },
  ): Promise<TheaterDto> {
    // HTTP DTO carries nested layout; the proto message is flat rows/cols.
    const layout = dto.layout ?? { rows: dto.rows ?? 0, cols: dto.cols ?? 0 };
    return grpcSend(
      this.cinema.CreateTheater({
        name: dto.name,
        address: dto.address,
        rows: layout.rows,
        cols: layout.cols,
      }),
    );
  }

  updateTheater(id: string, dto: TheaterUpdateRequest): Promise<TheaterDto> {
    return grpcSend(this.cinema.UpdateTheater({ id, ...dto }));
  }

  deleteTheater(id: string): Promise<void> {
    return grpcSend(this.cinema.DeleteTheater({ id })).then(() => undefined);
  }

  listShowtimes(q: ListShowtimesQuery): Promise<PaginatedShowtimes> {
    return grpcSend(this.cinema.ListShowtimes(q));
  }

  getShowtime(id: string): Promise<ShowtimeDto> {
    return grpcSend(this.cinema.GetShowtime({ id }));
  }

  createShowtime(dto: ShowtimeCreateRequest): Promise<ShowtimeDto> {
    return grpcSend(this.cinema.CreateShowtime(dto));
  }

  updateShowtime(id: string, dto: ShowtimeUpdateRequest): Promise<ShowtimeDto> {
    return grpcSend(this.cinema.UpdateShowtime({ id, ...dto }));
  }

  deleteShowtime(id: string): Promise<void> {
    return grpcSend(this.cinema.DeleteShowtime({ id })).then(() => undefined);
  }

  /**
   * Seat map with live availability: cinema-service provides the geometry
   * and pricing, ticket-service reports which seats are currently HELD
   * (live pending hold) or BOOKED (confirmed). Disabled seats are surfaced
   * as BOOKED so the UI blocks them.
   */
  async seatMap(id: string): Promise<GatewaySeatMap> {
    const [map, availability] = await Promise.all([
      grpcSend(this.cinema.GetSeatMap({ id })),
      this.getAvailability(id),
    ]);

    const statusBySeat = new Map<string, SeatAvailabilityStatus>();
    for (const seat of availability.seats ?? []) {
      statusBySeat.set(seat.seatId, seat.status);
    }

    const seats = map.seats.map((seat) => ({
      id: seat.id,
      row: seat.rowLabel,
      number: seat.number,
      category: seat.category,
      isAccessible: seat.isAccessible,
      isDisabled: seat.isDisabled,
      status: seat.isDisabled
        ? 'BOOKED'
        : (statusBySeat.get(seat.id) ?? 'AVAILABLE'),
    }));

    return { showtimeId: map.showtimeId, price: map.price, seats };
  }

  /**
   * Best-effort live availability. If ticket-service is unreachable, degrade
   * to an empty availability report so the seat map (geometry + pricing)
   * still renders; the real lock is still enforced server-side at hold time.
   */
  private async getAvailability(
    showtimeId: string,
  ): Promise<BookingAvailabilityResponse> {
    const req: BookingAvailabilityRequest = { showtimeId };
    try {
      return await grpcSend(this.ticket.Availability(req));
    } catch {
      return { showtimeId, seats: [] };
    }
  }
}
