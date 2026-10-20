export const SERVICE_NAMES = {
  USER: 'USER_SERVICE',
  CINEMA: 'CINEMA_SERVICE',
  BOOKING: 'BOOKING_SERVICE',
  PAYMENT: 'PAYMENT_SERVICE',
  TICKET: 'TICKET_SERVICE',
} as const;

export const GRPC_PACKAGES = {
  USER: 'user',
  CINEMA: 'cinema',
  BOOKING: 'booking',
  PAYMENT: 'payment',
  TICKET: 'ticket',
} as const;

export const GRPC_PORTS = {
  USER: Number(process.env.USER_PORT) || 50051,
  CINEMA: Number(process.env.CINEMA_PORT) || 50052,
  TICKET: Number(process.env.TICKET_PORT) || 50053,
  BOOKING: Number(process.env.BOOKING_PORT) || 50054,
  PAYMENT: Number(process.env.PAYMENT_PORT) || 50055,
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

/** RabbitMQ topology for domain commands and events. */
export const RMQ = {
  URL: process.env.RMQ_URL ?? 'amqp://rabbitmq:5672',
  /**
   * Legacy notification fanout. Kept for environments that still run the old
   * topology; new services publish through INTERNAL_EXCHANGE.
   */
  EXCHANGE: process.env.RMQ_EXCHANGE ?? 'ticketing.events',
  EXCHANGE_TYPE: process.env.RMQ_EXCHANGE_TYPE ?? 'fanout',
  /** Topic exchange carrying booking, payment, and ticket domain events. */
  INTERNAL_EXCHANGE: process.env.RMQ_INTERNAL_EXCHANGE ?? 'ticketing.internal',
  INTERNAL_EXCHANGE_TYPE: 'topic',
  DEAD_LETTER_EXCHANGE:
    process.env.RMQ_DEAD_LETTER_EXCHANGE ?? 'ticketing.dead-letter',
  QUEUES: {
    BOOKING_PAYMENT_EVENTS: 'booking.payment-events',
    PAYMENT_BOOKING_EVENTS: 'payment.booking-events',
    TICKET_BOOKING_EVENTS: 'ticket.booking-events',
    NOTIFICATION_EVENTS: 'notification.events',
  },
} as const;

export const PG_DBS = {
  USER: process.env.PG_USER_DB ?? 'user_db',
  CINEMA: process.env.PG_CINEMA_DB ?? 'cinema_db',
  BOOKING: process.env.PG_BOOKING_DB ?? 'booking_db',
  PAYMENT: process.env.PG_PAYMENT_DB ?? 'payment_db',
  TICKET: process.env.PG_TICKET_DB ?? 'ticket_db',
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
