import { Controller, Get, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  grpcSend,
  HealthResponse,
  SERVICE_NAMES,
  UserServiceStub,
  CinemaServiceStub,
  TicketServiceStub,
} from '@ticketing/shared';

@Controller()
export class HealthController {
  private readonly users: UserServiceStub;
  private readonly cinema: CinemaServiceStub;
  private readonly ticket: TicketServiceStub;

  constructor(
    @Inject(SERVICE_NAMES.USER) userClient: ClientGrpc,
    @Inject(SERVICE_NAMES.CINEMA) cinemaClient: ClientGrpc,
    @Inject(SERVICE_NAMES.TICKET) ticketClient: ClientGrpc,
  ) {
    this.users = userClient.getService<UserServiceStub>('UserService');
    this.cinema = cinemaClient.getService<CinemaServiceStub>('CinemaService');
    this.ticket = ticketClient.getService<TicketServiceStub>('TicketService');
  }

  @Get('health')
  async health() {
    const [user, cinema, ticket] = await Promise.all([
      grpcSend<HealthResponse>(this.users.Ping({})),
      grpcSend<HealthResponse>(this.cinema.Ping({})),
      grpcSend<HealthResponse>(this.ticket.Ping({})),
    ]);
    return { status: 'ok', services: { user, cinema, ticket } };
  }
}
