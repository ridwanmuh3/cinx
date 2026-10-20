import { Controller, Get, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  BookingServiceStub,
  CinemaServiceStub,
  grpcSend,
  HealthResponse,
  PaymentServiceStub,
  SERVICE_NAMES,
  TicketServiceStub,
  UserServiceStub,
} from '@ticketing/shared';

@Controller()
export class HealthController {
  private readonly users: UserServiceStub;
  private readonly cinema: CinemaServiceStub;
  private readonly booking: BookingServiceStub;
  private readonly payment: PaymentServiceStub;
  private readonly ticket: TicketServiceStub;

  constructor(
    @Inject(SERVICE_NAMES.USER) userClient: ClientGrpc,
    @Inject(SERVICE_NAMES.CINEMA) cinemaClient: ClientGrpc,
    @Inject(SERVICE_NAMES.BOOKING) bookingClient: ClientGrpc,
    @Inject(SERVICE_NAMES.PAYMENT) paymentClient: ClientGrpc,
    @Inject(SERVICE_NAMES.TICKET) ticketClient: ClientGrpc,
  ) {
    this.users = userClient.getService<UserServiceStub>('UserService');
    this.cinema = cinemaClient.getService<CinemaServiceStub>('CinemaService');
    this.booking =
      bookingClient.getService<BookingServiceStub>('BookingService');
    this.payment =
      paymentClient.getService<PaymentServiceStub>('PaymentService');
    this.ticket = ticketClient.getService<TicketServiceStub>('TicketService');
  }

  @Get('health')
  async health() {
    const [user, cinema, booking, payment, ticket] = await Promise.all([
      grpcSend<HealthResponse>(this.users.Ping({})),
      grpcSend<HealthResponse>(this.cinema.Ping({})),
      grpcSend<HealthResponse>(this.booking.Ping({})),
      grpcSend<HealthResponse>(this.payment.Ping({})),
      grpcSend<HealthResponse>(this.ticket.Ping({})),
    ]);
    return {
      status: 'ok',
      services: { user, cinema, booking, payment, ticket },
    };
  }
}
