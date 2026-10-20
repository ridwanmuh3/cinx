import Redis from 'ioredis';
import Redlock from 'redlock';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const LOCK_KEY = 'ticketing:smoke:lock';
const HOLD_TTL_MS = 5_000;

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const redlock = new Redlock([redis], { retryCount: 3, retryDelay: 200 });

  try {
    await redis.ping();
    console.log('[smoke] redis ping OK');

    const lockA = await redlock.acquire([LOCK_KEY], HOLD_TTL_MS);
    console.log('[smoke] lock acquired by holder A');

    let conflicted = false;
    try {
      const lockB = await redlock.acquire([LOCK_KEY], HOLD_TTL_MS, {
        retryCount: 1,
        retryDelay: 100,
      });
      await lockB.release();
    } catch {
      conflicted = true;
    }
    if (!conflicted) {
      throw new Error('second acquire on the same key should have conflicted');
    }
    console.log('[smoke] concurrent acquire correctly conflicted');

    await lockA.release();
    console.log('[smoke] holder A released');

    const lockC = await redlock.acquire([LOCK_KEY], HOLD_TTL_MS);
    console.log('[smoke] lock re-acquired after release');
    await lockC.release();

    console.log('SMOKE PASS');
  } catch (err) {
    console.error('SMOKE FAIL', err);
    process.exitCode = 1;
  } finally {
    await redis.quit();
  }
}

void main();
