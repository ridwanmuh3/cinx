import { initTelemetry } from '@ticketing/shared';

// Runs before bootstrap(): auto-instrumentation patches http/gRPC/pg/ioredis
// when the SDK starts, ahead of any traffic or client connections.
initTelemetry('gateway');

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RpcExceptionFilter } from './filters/rpc-exception.filter';
import { TelemetryInterceptor } from './common/telemetry.interceptor';
import { ValidationPipe } from '@nestjs/common';

// Same-origin SPA + config-driven extra origins. `origin: true` (reflect any
// origin) with `credentials: true` would let any site make credentialed
// requests — OWASP A05.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');

  // Security headers (CSP, HSTS, nosniff, frameguard, ...).
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new RpcExceptionFilter());
  app.useGlobalInterceptors(new TelemetryInterceptor());
  // Body size: express/body-parser default 100kb cap applies (DoS guard).

  app.enableCors({
    origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  // Rate limit auth + payment endpoints against brute force / abuse.
  app.set('trust proxy', 1);
  const rateLimit = (await import('express-rate-limit')).default;
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Too many attempts, retry later' },
  });
  const payLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Too many payment attempts' },
  });
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/bookings', payLimiter);
  // Public door-scan lookup: the ticket code is the only credential, so
  // throttle enumeration attempts hard (10/min/IP).
  app.use('/api/v1/tickets', payLimiter);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`gateway listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
