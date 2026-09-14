export const SERVICE_NAMES = {
  USER: 'USER_SERVICE',
  CINEMA: 'CINEMA_SERVICE',
  TICKET: 'TICKET_SERVICE',
} as const;

export const GRPC_PACKAGES = {
  USER: 'user',
  CINEMA: 'cinema',
  TICKET: 'ticket',
} as const;

export const GRPC_PORTS = {
  USER: Number(process.env.USER_PORT) || 50051,
  CINEMA: Number(process.env.CINEMA_PORT) || 50052,
  TICKET: Number(process.env.TICKET_PORT) || 50053,
} as const;

export const XENDIT_API_URL =
  process.env.XENDIT_API_URL ?? 'https://api.xendit.co';
export const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY ?? '';
export const XENDIT_WEBHOOK_TOKEN = process.env.XENDIT_WEBHOOK_TOKEN ?? '';
export const XENDIT_RETURN_URL = process.env.XENDIT_RETURN_URL ?? '';
/** Public HTTPS URL of the gateway webhook endpoint (setup script only). */
export const XENDIT_WEBHOOK_URL = process.env.XENDIT_WEBHOOK_URL ?? '';

export const RESEND_FROM =
  process.env.RESEND_FROM ?? 'CinX <no-reply@example.com>';
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
export const EMAIL_BASE_URL =
  process.env.EMAIL_BASE_URL ?? 'http://localhost:5173';

/** RabbitMQ topology (notification-service transport + event fan-out). */
export const RMQ = {
  URL: process.env.RMQ_URL ?? 'amqp://rabbitmq:5672',
  EXCHANGE: process.env.RMQ_EXCHANGE ?? 'ticketing.events',
  EXCHANGE_TYPE: process.env.RMQ_EXCHANGE_TYPE ?? 'fanout',
  NOTIFICATION_QUEUE:
    process.env.RMQ_NOTIFICATION_QUEUE ?? 'notification.queue',
  INTERNAL_EXCHANGE: process.env.RMQ_INTERNAL_EXCHANGE ?? 'ticketing.internal',
} as const;

export const PG_DBS = {
  USER: 'user_db',
  CINEMA: 'cinema_db',
  TICKET: 'ticket_db',
} as const;

export const PG_CONFIG = {
  HOST: process.env.PG_HOST ?? 'localhost',
  PORT: Number(process.env.PG_PORT) || 5432,
  USER: process.env.PG_USER ?? 'postgres',
  PASSWORD: process.env.PG_PASSWORD ?? 'postgres',
} as const;

export function buildPgUrl(db: string): string {
  return `postgres://${PG_CONFIG.USER}:${PG_CONFIG.PASSWORD}@${PG_CONFIG.HOST}:${PG_CONFIG.PORT}/${db}`;
}

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
