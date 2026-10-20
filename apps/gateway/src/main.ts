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
  // Controlled load tests run from one IP, so they would otherwise measure
  // this limiter instead of the services; disable it only for those runs.
  app.set('trust proxy', 1);
  const rateLimitEnabled =
    (process.env.RATE_LIMIT_ENABLED ?? 'true').toLowerCase() !== 'false';

  if (rateLimitEnabled) {
    const rateLimit = (await import('express-rate-limit')).default;
    const envInt = (name: string, fallback: number): number => {
      const value = Number(process.env[name]);
      return Number.isSafeInteger(value) && value > 0 ? value : fallback;
    };

    const authLimiter = rateLimit({
      windowMs: envInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
      limit: envInt('RATE_LIMIT_AUTH_MAX', 20),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { statusCode: 429, message: 'Too many attempts, retry later' },
    });
    const payLimiter = rateLimit({
      windowMs: envInt('RATE_LIMIT_PAY_WINDOW_MS', 60 * 1000),
      limit: envInt('RATE_LIMIT_PAY_MAX', 10),
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
  } else {
    console.warn(
      '[gateway] WARNING: rate limiting is disabled (RATE_LIMIT_ENABLED=false)',
    );
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`gateway listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
