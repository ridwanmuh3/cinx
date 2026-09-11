import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  GRPC_PACKAGES,
  GRPC_PORTS,
  protoPath,
  SERVICE_NAMES,
} from '@ticketing/shared';
import { SeatAvailabilityService } from './seat-availability.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SERVICE_NAMES.CINEMA,
        transport: Transport.GRPC,
        options: {
          package: GRPC_PACKAGES.CINEMA,
          protoPath: protoPath('cinema.proto'),
          url: `${process.env.CINEMA_HOST ?? '127.0.0.1'}:${Number(process.env.CINEMA_PORT) || GRPC_PORTS.CINEMA}`,
          loader: {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: false,
            oneofs: true,
          },
        },
      },
    ]),
  ],
  providers: [SeatAvailabilityService],
  exports: [ClientsModule, SeatAvailabilityService],
})
export class CinemaClientModule {}
