import { initTelemetry } from '@ticketing/shared';

// Runs before bootstrap(): auto-instrumentation patches http/gRPC/pg/ioredis
// when the SDK starts, ahead of any traffic or client connections.
initTelemetry('notification-service');

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import { RMQ } from '@ticketing/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT) || 3004;
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [RMQ.URL],
      queue: RMQ.NOTIFICATION_QUEUE,
      queueOptions: { durable: true },
      noAck: true,
      exchange: RMQ.EXCHANGE,
      exchangeType: RMQ.EXCHANGE_TYPE,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
  console.log(`notification-service http+rmq listening on :${port}`);
}

void bootstrap();
