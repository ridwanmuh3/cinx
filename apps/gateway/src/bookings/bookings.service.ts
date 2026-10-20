import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  BookingDto,
  BookingServiceStub,
  Empty,
  grpcSend,
  HoldResponse,
  MovieSummary,
  PaginatedBookings,
  PaymentChargeResponse,
  PaymentServiceStub,
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

/** Booking shape exposed to the web app: booking-service DTO enriched with
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

/**
 * The gateway is the only synchronous command router. It composes booking and
 * payment calls; the two domain services communicate exclusively through
 * events afterwards (payment.settled → booking.confirmed → tickets.issued).
 */
@Injectable()
export class BookingsService {
  private readonly booking: BookingServiceStub;
  private readonly payment: PaymentServiceStub;
  private readonly ticket: TicketServiceStub;

  constructor(
    @Inject(SERVICE_NAMES.BOOKING) bookingClient: ClientGrpc,
    @Inject(SERVICE_NAMES.PAYMENT) paymentClient: ClientGrpc,
    @Inject(SERVICE_NAMES.TICKET) ticketClient: ClientGrpc,
    private readonly cinema: CinemaService,
  ) {
    this.booking =
      bookingClient.getService<BookingServiceStub>('BookingService');
    this.payment =
      paymentClient.getService<PaymentServiceStub>('PaymentService');
    this.ticket = ticketClient.getService<TicketServiceStub>('TicketService');
  }

  hold(userId: string, dto: HoldSeatsDto): Promise<HoldResponse> {
    return grpcSend(
      this.booking.Hold({
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
      this.booking.List({ userId, page, limit }),
    );
    return {
      ...result,
      items: await Promise.all((result.items ?? []).map((b) => this.enrich(b))),
    };
  }

  async get(userId: string, id: string): Promise<BookingView> {
    const booking = await grpcSend<BookingDto>(
      this.booking.Get({ id, userId }),
    );
    return this.enrich(booking);
  }

  /**
   * Xendit payment: booking-service validates the hold and returns the
   * charge context; payment-service creates the hosted invoice. The gateway
   * never confirms the booking itself — that happens on `payment.settled`.
   */
  async pay(
    userId: string,
    id: string,
    dto: PayBookingDto,
  ): Promise<PayResult> {
    const context = await grpcSend(this.booking.PrepareCharge({ id, userId }));
    const charge = await grpcSend<PaymentChargeResponse>(
      this.payment.Charge({
        bookingId: context.bookingId,
        userId,
        amount: context.amount,
        currency: context.currency,
        expiresAt: context.expiresAt,
        description: context.description,
        returnUrl: dto.returnUrl ?? '',
        payerEmail: dto.payerEmail ?? '',
      }),
    );

    const booking = await this.enrich(
      await grpcSend<BookingDto>(this.booking.Get({ id, userId })),
    );
    return {
      ...booking,
      checkoutUrl: charge.checkoutUrl ?? null,
      invoiceId: charge.invoiceId ?? null,
    };
  }

  /** Forward a verified Xendit webhook to payment-service. */
  webhook(signature: string, body: string): Promise<Empty> {
    return grpcSend(this.payment.Webhook({ signature, body }));
  }

  /**
   * Server-side Xendit status sync. payment-service checks the provider and
   * publishes the settlement; booking.confirmed/tickets.issued then update
   * booking-service asynchronously. The returned projection is eventual —
   * the web app polls the booking until it is CONFIRMED.
   */
  async syncPaymentStatus(userId: string, id: string): Promise<BookingView> {
    await grpcSend(this.payment.SyncPaymentStatus({ bookingId: id }));
    const booking = await grpcSend<BookingDto>(
      this.booking.Get({ id, userId }),
    );
    return this.enrich(booking);
  }

  async cancel(userId: string, id: string): Promise<BookingView> {
    const booking = await grpcSend<BookingDto>(
      this.booking.Cancel({ id, userId }),
    );
    return this.enrich(booking);
  }

  getTicketByCode(code: string): Promise<TicketLookupDto> {
    return grpcSend(this.ticket.GetTicketByCode({ code }));
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
        // Read-only: ticket-service issues tickets when booking.confirmed
        // arrives, never as a side effect of the customer loading a booking.
        view.tickets = await this.listTickets(booking);
      } catch {
        // tickets unavailable — non-fatal
      }
    }
    return view;
  }

  private listTickets(booking: BookingDto): Promise<TicketDto[]> {
    return grpcSend<TicketList>(
      this.ticket.ListTickets({ bookingId: booking.id }),
    ).then((list) => list.items ?? []);
  }
}
