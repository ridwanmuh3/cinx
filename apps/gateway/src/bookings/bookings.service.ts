import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  BookingDto,
  MovieSummary,
  PaginatedBookings,
  SERVICE_NAMES,
  TheaterSummary,
  TicketDto,
  TicketLookupDto,
  TicketPatterns,
} from '@ticketing/shared';
import { CinemaService } from '../cinema/cinema.service';
import { rpcSend } from '../common/rpc/rpc.util';
import { HoldSeatsDto } from './dto/hold.dto';
import { PayBookingDto } from './dto/pay.dto';

/** Booking shape exposed to the web app: ticket-service DTO enriched with
 *  the showtime's movie/theater context from cinema-service (best effort)
 *  and issued ticket codes for confirmed bookings. */
export interface BookingView extends BookingDto {
  movie?: MovieSummary;
  theater?: TheaterSummary;
  startsAt?: string;
  tickets?: TicketDto[];
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(SERVICE_NAMES.TICKET) private readonly ticketClient: ClientProxy,
    private readonly cinema: CinemaService,
  ) {}

  hold(userId: string, dto: HoldSeatsDto) {
    return rpcSend(this.ticketClient, TicketPatterns.BOOKING_HOLD, {
      userId,
      showtimeId: dto.showtimeId,
      seatIds: dto.seatIds,
    });
  }

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedBookings> {
    const result = await rpcSend<PaginatedBookings>(
      this.ticketClient,
      TicketPatterns.BOOKING_LIST,
      { userId, page, limit },
    );
    return {
      ...result,
      items: await Promise.all(result.items.map((b) => this.enrich(b))),
    };
  }

  async get(userId: string, id: string): Promise<BookingView> {
    const booking = await rpcSend<BookingDto>(
      this.ticketClient,
      TicketPatterns.BOOKING_GET,
      { id, userId },
    );
    return this.enrich(booking);
  }

  /** Mock payment orchestration: charge via the provider, then confirm. */
  async pay(
    userId: string,
    id: string,
    dto: PayBookingDto,
  ): Promise<BookingView> {
    const charge = await rpcSend<{
      providerId: string;
      paid: boolean;
      paidAt: string | null;
      receiptUrl: string | null;
    }>(this.ticketClient, TicketPatterns.PAYMENT_CHARGE, {
      simulate: dto.simulate,
    });

    const booking = await rpcSend<BookingDto>(
      this.ticketClient,
      TicketPatterns.PAYMENT_CONFIRM,
      {
        bookingId: id,
        userId,
        paid: charge.paid,
        providerId: charge.providerId,
        paidAt: charge.paidAt,
        receipt: charge.receiptUrl,
      },
    );
    return this.enrich(booking);
  }

  cancel(userId: string, id: string): Promise<BookingView> {
    return this.cancelInner(userId, id);
  }

  getTicketByCode(code: string): Promise<TicketLookupDto> {
    return rpcSend(this.ticketClient, TicketPatterns.TICKET_GET_BY_CODE, {
      code,
    });
  }

  private async cancelInner(userId: string, id: string): Promise<BookingView> {
    const booking = await rpcSend<BookingDto>(
      this.ticketClient,
      TicketPatterns.BOOKING_CANCEL,
      { id, userId },
    );
    return this.enrich(booking);
  }

  private async enrich(booking: BookingDto): Promise<BookingView> {
    const view: BookingView = { ...booking };
    try {
      const showtime = await this.cinema.getShowtime(booking.showtimeId);
      view.movie = showtime.movie;
      view.theater = showtime.theater;
      view.startsAt = showtime.startsAt;
    } catch {
      // showtime context is best-effort; booking data is still returned
    }
    if (booking.status === 'CONFIRMED') {
      try {
        view.tickets = await rpcSend<TicketDto[]>(
          this.ticketClient,
          TicketPatterns.TICKET_CREATE,
          { id: booking.id, userId: booking.userId },
        );
      } catch {
        // tickets already issued or unavailable — non-fatal
      }
    }
    return view;
  }
}
