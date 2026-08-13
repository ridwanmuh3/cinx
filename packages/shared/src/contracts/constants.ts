export const SERVICE_NAMES = {
  USER: 'USER_SERVICE',
  CINEMA: 'CINEMA_SERVICE',
  TICKET: 'TICKET_SERVICE',
} as const;

export const TCP_PORTS = {
  GATEWAY: 3000,
  USER: 3001,
  CINEMA: 3002,
  TICKET: 3003,
} as const;

export const PG_DBS = {
  USER: 'user_db',
  CINEMA: 'cinema_db',
  TICKET: 'ticket_db',
} as const;

export const PG_CONFIG = {
  HOST: process.env.PG_HOST ?? 'localhost',
  PORT: Number(process.env.PG_PORT ?? 5432),
  USER: process.env.PG_USER ?? 'postgres',
  PASSWORD: process.env.PG_PASSWORD ?? 'postgres',
} as const;

export function buildPgUrl(db: string): string {
  return `postgres://${PG_CONFIG.USER}:${PG_CONFIG.PASSWORD}@${PG_CONFIG.HOST}:${PG_CONFIG.PORT}/${db}`;
}

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
