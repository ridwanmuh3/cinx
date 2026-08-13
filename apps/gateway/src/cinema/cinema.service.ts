import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  CinemaPatterns,
  ListMoviesQuery,
  ListShowtimesQuery,
  MovieCreateRequest,
  MovieDto,
  MovieUpdateRequest,
  PaginatedMovies,
  PaginatedShowtimes,
  PaginatedTheaters,
  SERVICE_NAMES,
  SeatAvailabilityStatus,
  ShowtimeCreateRequest,
  ShowtimeDto,
  ShowtimeSeatMap,
  ShowtimeUpdateRequest,
  TheaterCreateRequest,
  TheaterDto,
  TheaterUpdateRequest,
  TicketPatterns,
} from '@ticketing/shared';
import { rpcSend } from '../common/rpc/rpc.util';

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
  constructor(
    @Inject(SERVICE_NAMES.CINEMA) private readonly cinemaClient: ClientProxy,
    @Inject(SERVICE_NAMES.TICKET) private readonly ticketClient: ClientProxy,
  ) {}

  listMovies(q: ListMoviesQuery): Promise<PaginatedMovies> {
    return rpcSend(this.cinemaClient, CinemaPatterns.MOVIES_LIST, q);
  }

  getMovie(id: string): Promise<MovieDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.MOVIE_GET, { id });
  }

  createMovie(dto: MovieCreateRequest): Promise<MovieDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.MOVIE_CREATE, dto);
  }

  updateMovie(id: string, dto: MovieUpdateRequest): Promise<MovieDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.MOVIE_UPDATE, {
      id,
      ...dto,
    });
  }

  deleteMovie(id: string): Promise<void> {
    return rpcSend(this.cinemaClient, CinemaPatterns.MOVIE_DELETE, { id });
  }

  listTheaters(q: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedTheaters> {
    return rpcSend(this.cinemaClient, CinemaPatterns.THEATERS_LIST, q);
  }

  getTheater(id: string): Promise<TheaterDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.THEATER_GET, { id });
  }

  createTheater(dto: TheaterCreateRequest): Promise<TheaterDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.THEATER_CREATE, dto);
  }

  updateTheater(id: string, dto: TheaterUpdateRequest): Promise<TheaterDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.THEATER_UPDATE, {
      id,
      ...dto,
    });
  }

  deleteTheater(id: string): Promise<void> {
    return rpcSend(this.cinemaClient, CinemaPatterns.THEATER_DELETE, { id });
  }

  listShowtimes(q: ListShowtimesQuery): Promise<PaginatedShowtimes> {
    return rpcSend(this.cinemaClient, CinemaPatterns.SHOWTIMES_LIST, q);
  }

  getShowtime(id: string): Promise<ShowtimeDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.SHOWTIME_GET, { id });
  }

  createShowtime(dto: ShowtimeCreateRequest): Promise<ShowtimeDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.SHOWTIME_CREATE, dto);
  }

  updateShowtime(id: string, dto: ShowtimeUpdateRequest): Promise<ShowtimeDto> {
    return rpcSend(this.cinemaClient, CinemaPatterns.SHOWTIME_UPDATE, {
      id,
      ...dto,
    });
  }

  deleteShowtime(id: string): Promise<void> {
    return rpcSend(this.cinemaClient, CinemaPatterns.SHOWTIME_DELETE, { id });
  }

  /**
   * Seat map with live availability: cinema-service provides the geometry
   * and pricing, ticket-service reports which seats are currently HELD
   * (live pending hold) or BOOKED (confirmed). Disabled seats are surfaced
   * as BOOKED so the UI blocks them.
   */
  async seatMap(id: string): Promise<GatewaySeatMap> {
    const [map, availability] = await Promise.all([
      rpcSend<ShowtimeSeatMap>(
        this.cinemaClient,
        CinemaPatterns.SHOWTIME_SEATS,
        {
          id,
        },
      ),
      this.getAvailability(id),
    ]);

    const statusBySeat = new Map<string, SeatAvailabilityStatus>();
    for (const seat of availability.seats) {
      statusBySeat.set(seat.seatId, seat.status);
    }

    return {
      showtimeId: map.showtimeId,
      price: map.price,
      seats: map.seats.map((seat) => ({
        id: seat.id,
        row: seat.rowLabel,
        number: seat.number,
        category: seat.category,
        isAccessible: seat.isAccessible,
        isDisabled: seat.isDisabled,
        status: seat.isDisabled
          ? 'BOOKED'
          : (statusBySeat.get(seat.id) ?? 'AVAILABLE'),
      })),
    };
  }

  /**
   * Best-effort live availability. If ticket-service is unreachable, degrade
   * to an empty availability report so the seat map (geometry + pricing)
   * still renders; the real lock is still enforced server-side at hold time.
   */
  private async getAvailability(
    showtimeId: string,
  ): Promise<BookingAvailabilityResponse> {
    try {
      return await rpcSend<BookingAvailabilityResponse>(
        this.ticketClient,
        TicketPatterns.BOOKING_AVAILABILITY,
        { showtimeId } satisfies BookingAvailabilityRequest,
      );
    } catch {
      return { showtimeId, seats: [] };
    }
  }
}
