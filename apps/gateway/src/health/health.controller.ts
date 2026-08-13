import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  HealthPatterns,
  HealthResponse,
  SERVICE_NAMES,
} from '@ticketing/shared';

@Controller()
export class HealthController {
  constructor(
    @Inject(SERVICE_NAMES.USER) private readonly userClient: ClientProxy,
    @Inject(SERVICE_NAMES.CINEMA) private readonly cinemaClient: ClientProxy,
    @Inject(SERVICE_NAMES.TICKET) private readonly ticketClient: ClientProxy,
  ) {}

  @Get('health')
  async health() {
    const ping = (client: ClientProxy) =>
      firstValueFrom(client.send<HealthResponse>(HealthPatterns.PING, {}));
    const [user, cinema, ticket] = await Promise.all([
      ping(this.userClient),
      ping(this.cinemaClient),
      ping(this.ticketClient),
    ]);
    return { status: 'ok', services: { user, cinema, ticket } };
  }
}
