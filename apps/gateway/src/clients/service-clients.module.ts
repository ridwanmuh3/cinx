import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_NAMES, TCP_PORTS } from '@ticketing/shared';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SERVICE_NAMES.USER,
        transport: Transport.TCP,
        options: {
          host: process.env.USER_HOST ?? '127.0.0.1',
          port: Number(process.env.USER_PORT ?? TCP_PORTS.USER),
        },
      },
      {
        name: SERVICE_NAMES.CINEMA,
        transport: Transport.TCP,
        options: {
          host: process.env.CINEMA_HOST ?? '127.0.0.1',
          port: Number(process.env.CINEMA_PORT ?? TCP_PORTS.CINEMA),
        },
      },
      {
        name: SERVICE_NAMES.TICKET,
        transport: Transport.TCP,
        options: {
          host: process.env.TICKET_HOST ?? '127.0.0.1',
          port: Number(process.env.TICKET_PORT ?? TCP_PORTS.TICKET),
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class ServiceClientsModule {}
