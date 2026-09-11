import { initTelemetry } from '@ticketing/shared';

// Runs before bootstrap(): auto-instrumentation patches http/gRPC/pg/ioredis
// when the SDK starts, ahead of any traffic or client connections.
initTelemetry('cinema-service');

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  GRPC_PACKAGES,
  GRPC_PORTS,
  GrpcExceptionFilter,
  protoPath,
} from '@ticketing/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT) || GRPC_PORTS.CINEMA;
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: GRPC_PACKAGES.CINEMA,
        protoPath: protoPath('cinema.proto'),
        url: `0.0.0.0:${port}`,
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: false,
          oneofs: true,
        },
      },
    },
  );
  app.useGlobalFilters(new GrpcExceptionFilter());
  await app.listen();
  console.log(`cinema-service listening on gRPC :${port}`);
}

void bootstrap();
