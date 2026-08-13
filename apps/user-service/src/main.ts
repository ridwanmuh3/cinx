import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { rpcErrorPayload, TCP_PORTS } from '@ticketing/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT) || TCP_PORTS.USER;
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port },
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new RpcException(
          rpcErrorPayload(
            400,
            errors.map((e) => {
              const first = Object.values(e.constraints ?? {})[0];
              return `${e.property}: ${first}`;
            }),
          ),
        ),
    }),
  );
  await app.listen();
  console.log(`user-service listening on TCP :${port}`);
}

void bootstrap();
