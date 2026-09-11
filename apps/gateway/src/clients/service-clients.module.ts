import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  GRPC_PORTS,
  GRPC_PACKAGES,
  protoPath,
} from '@ticketing/shared';

const grpcLoader = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: false,
  oneofs: true,
};

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SERVICE_NAMES.USER,
        transport: Transport.GRPC,
        options: {
          package: GRPC_PACKAGES.USER,
          protoPath: protoPath('user.proto'),
          url: `${process.env.USER_HOST ?? '127.0.0.1'}:${Number(process.env.USER_PORT) || GRPC_PORTS.USER}`,
          loader: grpcLoader,
        },
      },
      {
        name: SERVICE_NAMES.CINEMA,
        transport: Transport.GRPC,
        options: {
          package: GRPC_PACKAGES.CINEMA,
          protoPath: protoPath('cinema.proto'),
          url: `${process.env.CINEMA_HOST ?? '127.0.0.1'}:${Number(process.env.CINEMA_PORT) || GRPC_PORTS.CINEMA}`,
          loader: grpcLoader,
        },
      },
      {
        name: SERVICE_NAMES.TICKET,
        transport: Transport.GRPC,
        options: {
          package: GRPC_PACKAGES.TICKET,
          protoPath: protoPath('ticket.proto'),
          url: `${process.env.TICKET_HOST ?? '127.0.0.1'}:${Number(process.env.TICKET_PORT) || GRPC_PORTS.TICKET}`,
          loader: grpcLoader,
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class ServiceClientsModule {}
