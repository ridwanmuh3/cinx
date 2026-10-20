import { initTelemetry } from '@ticketing/shared';

initTelemetry('payment-service');

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  GRPC_PACKAGES,
  GRPC_PORTS,
  GrpcExceptionFilter,
  protoPath,
  RMQ,
  RmqAckInterceptor,
} from '@ticketing/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT) || GRPC_PORTS.PAYMENT;
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.useGlobalInterceptors(new RmqAckInterceptor());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.GRPC,
      options: {
        package: GRPC_PACKAGES.PAYMENT,
        protoPath: protoPath('payment.proto'),
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
    { inheritAppConfig: true },
  );

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [RMQ.URL],
        queue: RMQ.QUEUES.PAYMENT_BOOKING_EVENTS,
        queueOptions: { durable: true },
        exchange: RMQ.INTERNAL_EXCHANGE,
        exchangeType: RMQ.INTERNAL_EXCHANGE_TYPE,
        wildcards: true,
        noAck: false,
      },
    },
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();
  console.log(`payment-service listening on gRPC :${port}`);
}

void bootstrap();
