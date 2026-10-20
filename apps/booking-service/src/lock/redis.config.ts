import { RedisOptions } from 'ioredis';
import { REDIS_URL } from '@ticketing/shared';

export const redisConfig: RedisOptions = {
  host: (() => {
    try {
      const url = new URL(REDIS_URL);
      return url.hostname;
    } catch {
      return 'localhost';
    }
  })(),
  port: (() => {
    try {
      const url = new URL(REDIS_URL);
      return Number(url.port) || 6379;
    } catch {
      return 6379;
    }
  })(),
  maxRetriesPerRequest: null,
};
