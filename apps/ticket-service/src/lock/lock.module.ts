import { Global, Injectable, Inject, Module } from '@nestjs/common';
import { REDIS_URL } from '@ticketing/shared';
import Redis from 'ioredis';
import Redlock, { Lock } from 'redlock';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDLOCK = Symbol('REDLOCK');

const HOLD_TTL_MS = 5 * 60_000; // 5 minutes
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 200;
const RETRY_JITTER = 200;

export interface LockHandle {
  /** Redlock Lock handle with release(). */
  lock: Lock;
  /** The Redis keys that were acquired. */
  keys: string[];
  /** Release the lock (best-effort; swallow release errors). */
  release: () => Promise<void>;
  /** Extend the lock TTL. Throws if the lock was lost (TTL expiry / other holder). */
  extend: (ttlMs: number) => Promise<void>;
}

@Injectable()
export class SeatLockService {
  constructor(@Inject(REDLOCK) private readonly redlock: Redlock) {}

  /** Acquire a redlock across all the given seat keys together. */
  async hold(
    seatKeys: string[],
    ttlMs: number = HOLD_TTL_MS,
  ): Promise<LockHandle> {
    const lock = await this.redlock.acquire(seatKeys, ttlMs);
    return {
      lock,
      keys: seatKeys,
      release: async () => {
        try {
          await lock.release();
        } catch {
          /* best-effort release */
        }
      },
      extend: async (newTtlMs: number) => {
        await lock.extend(newTtlMs);
      },
    };
  }

  /** Build the Redis lock key for a single seat. */
  lockKey(showtimeId: string, seatId: string): string {
    return `seat:${showtimeId}:${seatId}`;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
      },
    },
    {
      provide: REDLOCK,
      useFactory: (redis: Redis) => {
        return new Redlock([redis], {
          retryCount: RETRY_COUNT,
          retryDelay: RETRY_DELAY_MS,
          retryJitter: RETRY_JITTER,
        });
      },
      inject: [REDIS_CLIENT],
    },
    SeatLockService,
  ],
  exports: [REDIS_CLIENT, REDLOCK, SeatLockService],
})
export class RedisModule {}
