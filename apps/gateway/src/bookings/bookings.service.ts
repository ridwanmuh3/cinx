import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  BookingDto,
  Empty,
  grpcSend,
  HoldResponse,
  MovieSummary,
  PaginatedBookings,
  PaymentChargeResponse,
  SERVICE_NAMES,
  TheaterSummary,
  TicketDto,
  TicketList,
  TicketLookupDto,
  TicketServiceStub,
} from '@ticketing/shared';
import { CinemaService } from '../cinema/cinema.service';
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

export interface PayResult extends BookingView {
  checkoutUrl: string | null;
  invoiceId: string | null;
}

@Injectable()
export class BookingsService {
  private readonly ticket: TicketServiceStub;

  constructor(
    @Inject(SERVICE_NAMES.TICKET) ticketClient: ClientGrpc,
    private readonly cinema: CinemaService,
  ) {
    this.ticket = ticketClient.getService<TicketServiceStub>('TicketService');
  }

  hold(userId: string, dto: HoldSeatsDto): Promise<HoldResponse> {
    return grpcSend(
      this.ticket.Hold({
        userId,
        showtimeId: dto.showtimeId,
        seatIds: dto.seatIds,
      }),
    );
  }

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedBookings> {
    const result = await grpcSend<PaginatedBookings>(
      this.ticket.List({ userId, page, limit }),
    );
    return {
      ...result,
      items: await Promise.all((result.items ?? []).map((b) => this.enrich(b))),
    };
  }

  async get(userId: string, id: string): Promise<BookingView> {
    const booking = await grpcSend<BookingDto>(this.ticket.Get({ id, userId }));
    return this.enrich(booking);
  }

  /**
   * Xendit payment: create a hosted invoice for the booking and return its
   * checkout URL. The user pays on Xendit's page; confirmation arrives via
   * the Xendit webhook (no synchronous confirm here).
   */
  async pay(
    userId: string,
    id: string,
    dto: PayBookingDto,
  ): Promise<PayResult> {
    const charge = await grpcSend<PaymentChargeResponse>(
      this.ticket.Charge({
        bookingId: id,
        userId,
        returnUrl: dto.returnUrl ?? '',
        payerEmail: dto.payerEmail ?? '',
      }),
    );

    const booking = await this.enrich(
      await grpcSend<BookingDto>(this.ticket.Get({ id, userId })),
    );
    return {
      ...booking,
      checkoutUrl: charge.checkoutUrl ?? null,
      invoiceId: charge.invoiceId ?? null,
    };
  }

  /** Forward a verified Xendit webhook to ticket-service. */
  webhook(signature: string, body: string): Promise<Empty> {
    return grpcSend(this.ticket.Webhook({ signature, body }));
  }

  cancel(userId: string, id: string): Promise<BookingView> {
    return this.cancelInner(userId, id);
  }

  getTicketByCode(code: string): Promise<TicketLookupDto> {
    return grpcSend(this.ticket.GetTicketByCode({ code }));
  }

  private async cancelInner(userId: string, id: string): Promise<BookingView> {
    const booking = await grpcSend<BookingDto>(
      this.ticket.Cancel({ id, userId }),
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
        view.tickets = await this.createTickets(booking);
      } catch {
        // tickets already issued or unavailable — non-fatal
      }
    }
    return view;
  }

  private createTickets(booking: BookingDto): Promise<TicketDto[]> {
    return grpcSend<TicketList>(
      this.ticket.CreateTickets({ id: booking.id, userId: booking.userId }),
    ).then((list) => list.items ?? []);
  }
}
