import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  GRPC_PACKAGES,
  GRPC_PORTS,
  protoPath,
  SERVICE_NAMES,
} from '@ticketing/shared';
import { CustomerDirectoryService } from './customer-directory.service';

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
  providers: [CustomerDirectoryService],
  exports: [ClientsModule, CustomerDirectoryService],
})
export class UserClientModule {}
