import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_NAMES, TCP_PORTS } from '@ticketing/shared';
import { SeatAvailabilityService } from './seat-availability.service';

export const CINEMA_CLIENT = Symbol('CINEMA_CLIENT');

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SERVICE_NAMES.CINEMA,
        transport: Transport.TCP,
        options: {
          host: process.env.CINEMA_HOST ?? '127.0.0.1',
          port: Number(process.env.CINEMA_PORT ?? TCP_PORTS.CINEMA),
        },
      },
    ]),
  ],
  providers: [SeatAvailabilityService],
  exports: [ClientsModule, SeatAvailabilityService],
})
export class CinemaClientModule {}
