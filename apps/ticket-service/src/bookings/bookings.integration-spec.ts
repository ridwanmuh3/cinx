import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { ShowtimeSeatMap, REDIS_URL } from '@ticketing/shared';
import { typeOrmConfig } from '../database/typeorm.config';
import {
  RedisModule,
  REDIS_CLIENT,
  SeatLockService,
} from '../lock/lock.module';
import { BookingsModule } from './bookings.module';
import { BookingsService } from './bookings.service';
import { SeatAvailabilityService } from '../cinema/seat-availability.service';
import { PaymentService } from '../payments/payment.service';
import { Booking } from './booking.entity';

/**
 * Live Postgres + Redis integration tests.
 *
 * Requires infra: `just up` (postgres:5432, redis:6379).
 * Run: `pnpm --filter @ticketing/ticket-service test:integration`
 *
 * Cinema TCP is stubbed — these tests exercise the seat-lock manager and
 * booking persistence against real ticket_db + Redis, not the cinema service.
 */

const mockSeatMap: ShowtimeSeatMap = {
  showtimeId: '00000000-0000-0000-0000-000000000001',
  movieId: '00000000-0000-0000-0000-000000000010',
  movieTitle: 'Integration Cinema Movie',
  posterUrl: null,
  ageRating: 'SU',
  durationMinutes: 120,
  theaterId: '00000000-0000-0000-0000-000000000100',
  theaterName: 'Theater 1',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  price: { amount: 50000, currency: 'IDR' },
  seats: [
    {
      id: '00000000-0000-0000-0000-000000001001',
      rowLabel: 'A',
      number: 1,
      category: 'REGULAR',
      isAccessible: false,
      isDisabled: false,
    },
    {
      id: '00000000-0000-0000-0000-000000001002',
      rowLabel: 'A',
      number: 2,
      category: 'REGULAR',
      isAccessible: false,
      isDisabled: false,
    },
  ],
};

function rpcStatus(err: unknown): number | undefined {
  if (!(err instanceof RpcException)) return undefined;
  const payload = err.getError() as { statusCode?: number; message?: string };
  return payload.statusCode;
}

function rpcMessage(err: unknown): string {
  if (!(err instanceof RpcException)) return '';
  const payload = err.getError() as { message?: string };
  return typeof payload.message === 'string' ? payload.message : '';
}

describe('Bookings Integration (Real Postgres + Redis)', () => {
  let moduleRef: TestingModule;
  let bookingsService: BookingsService;
  let seatLockService: SeatLockService;
  let dataSource: DataSource;
  let redisClient: Redis;

  const mockSeatAvailability = {
    getSeatMap: jest.fn().mockResolvedValue(mockSeatMap),
    validateSeats: jest
      .fn()
      .mockImplementation((_showtimeId: string, seatIds: string[]) => {
        const found = mockSeatMap.seats.filter((s) => seatIds.includes(s.id));
        return Promise.resolve({ seats: found, seatMap: mockSeatMap });
      }),
  };

  // Offline stand-in for Xendit: no network, deterministic behaviour.
  const fakePaymentService = {
    externalIdFor: jest.fn(
      (bookingId: string) => `cix-${bookingId}`,
    ) as PaymentService['externalIdFor'],
    createInvoiceForBooking: jest.fn(),
    getInvoiceStatus: jest.fn(),
    expireInvoice: jest.fn(),
    verifySignature: jest.fn(),
    parseCallback: jest.fn((rawBody: string) => {
      const data = JSON.parse(rawBody) as {
        id: string;
        external_id: string;
        status: string;
      };
      return {
        id: data.id,
        external_id: data.external_id,
        status: data.status,
        paid_at: new Date().toISOString(),
        payment_method: null,
        payment_channel: null,
        paid_amount: null,
        amount: null,
      };
    }),
    invoiceDurationFor: jest.fn(() => 300),
    successRedirectUrl: jest.fn(),
    failureRedirectUrl: jest.fn(),
  };

  beforeAll(async () => {
    // Fail fast with a clear message if infra is down.
    const probe = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    try {
      await probe.connect();
      await probe.ping();
    } catch {
      throw new Error(
        `Redis unreachable at ${REDIS_URL}. Start infra with: just up`,
      );
    } finally {
      probe.disconnect();
    }

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...typeOrmConfig,
          synchronize: true,
        }),
        RedisModule,
        BookingsModule,
      ],
    })
      .overrideProvider(SeatAvailabilityService)
      .useValue(mockSeatAvailability)
      .overrideProvider(PaymentService)
      .useValue(fakePaymentService)
      .compile();

    bookingsService = moduleRef.get(BookingsService);
    seatLockService = moduleRef.get(SeatLockService);
    dataSource = moduleRef.get(DataSource);
    redisClient = moduleRef.get(REDIS_CLIENT);
  }, 30000);

  afterAll(async () => {
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch {
        redisClient.disconnect();
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE tickets, payments, booking_seats, bookings CASCADE;',
    );

    const keys = await redisClient.keys('seat:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    mockSeatAvailability.getSeatMap.mockClear();
    mockSeatAvailability.validateSeats.mockClear();
  });

  describe('1. Lock contention (two holds, same seat)', () => {
    it('prevents concurrent holds on the same seat and returns 409', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[0].id;

      const hold1 = await bookingsService.hold({
        userId: '00000000-0000-0000-0000-000000000011',
        showtimeId,
        seatIds: [seatId],
      });

      expect(hold1.bookingId).toBeDefined();
      expect(hold1.status).toBe('PENDING');

      const lockKey = seatLockService.lockKey(showtimeId, seatId);
      expect(await redisClient.exists(lockKey)).toBe(1);

      let error: unknown;
      try {
        await bookingsService.hold({
          userId: '00000000-0000-0000-0000-000000000022',
          showtimeId,
          seatIds: [seatId],
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(RpcException);
      expect(rpcStatus(error)).toBe(409);
      expect(rpcMessage(error)).toContain('already held');
    });
  });

  describe('2. TTL expiry release in Redis', () => {
    it('automatically releases Redlock after TTL expires', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[0].id;
      const key = seatLockService.lockKey(showtimeId, seatId);

      const handle = await seatLockService.hold([key], 1000);
      expect(handle).toBeDefined();

      await expect(seatLockService.hold([key], 1000)).rejects.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const handle2 = await seatLockService.hold([key], 1000);
      expect(handle2).toBeDefined();
      await handle2.release();
    });
  });

  describe('3. Confirm-after-expiry (410 Gone)', () => {
    it('rejects confirmation with 410 when Redis lock was lost (TTL / eviction)', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[0].id;
      const userId = '00000000-0000-0000-0000-000000000033';

      const hold = await bookingsService.hold({
        userId,
        showtimeId,
        seatIds: [seatId],
      });

      // Simulate TTL expiry / lock loss by deleting the Redis key while the
      // in-memory LockHandle still exists (same process as production hold).
      const key = seatLockService.lockKey(showtimeId, seatId);
      await redisClient.del(key);

      let error: unknown;
      try {
        await bookingsService.confirm({
          bookingId: hold.bookingId,
          userId,
          paid: true,
          providerId: hold.payment.providerId,
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(RpcException);
      expect(rpcStatus(error)).toBe(410);
      expect(rpcMessage(error)).toContain('expired');

      const bookingInDb = await dataSource
        .getRepository(Booking)
        .findOneBy({ id: hold.bookingId });
      expect(bookingInDb?.status).toBe('EXPIRED');
    });

    it('rejects confirmation with 410 when booking status is already EXPIRED in DB', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[1].id;
      const userId = '00000000-0000-0000-0000-000000000044';

      const hold = await bookingsService.hold({
        userId,
        showtimeId,
        seatIds: [seatId],
      });

      await dataSource
        .getRepository(Booking)
        .update({ id: hold.bookingId }, { status: 'EXPIRED' });

      let error: unknown;
      try {
        await bookingsService.confirm({
          bookingId: hold.bookingId,
          userId,
          paid: true,
          providerId: hold.payment.providerId,
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(RpcException);
      expect(rpcStatus(error)).toBe(410);
    });
  });

  describe('4. Five concurrent holds, same seat', () => {
    it('lets exactly one win and rejects the other four with 409', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[0].id;

      const attempts = await Promise.allSettled(
        [11, 22, 33, 44, 55].map((n) =>
          bookingsService.hold({
            userId: `00000000-0000-0000-0000-0000000000${n}`,
            showtimeId,
            seatIds: [seatId],
          }),
        ),
      );

      const won = attempts.filter((a) => a.status === 'fulfilled');
      const lost = attempts.filter((a) => a.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(4);
      for (const l of lost) {
        expect(rpcStatus((l as PromiseRejectedResult).reason)).toBe(409);
      }

      // Exactly one live seat row owns the seat — no double-hold in the DB.
      const rows = await dataSource.query(
        `SELECT COUNT(*)::int AS c FROM booking_seats bs JOIN bookings b ON b.id = bs."bookingId" WHERE bs.showtime_id = $1 AND bs.seat_id = $2 AND b.status = 'PENDING'`,
        [showtimeId, seatId],
      );
      expect(Number(rows[0]?.c)).toBe(1);
    }, 30000);
  });

  describe('5. Re-book after cancel', () => {
    it('allows the same seat to be held again after cancellation', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[0].id;
      const firstUser = '00000000-0000-0000-0000-000000000061';
      const secondUser = '00000000-0000-0000-0000-000000000062';

      const first = await bookingsService.hold({
        userId: firstUser,
        showtimeId,
        seatIds: [seatId],
      });
      expect(first.status).toBe('PENDING');

      const cancelled = await bookingsService.cancel({
        id: first.bookingId,
        userId: firstUser,
      });
      expect(cancelled.status).toBe('CANCELLED');

      const second = await bookingsService.hold({
        userId: secondUser,
        showtimeId,
        seatIds: [seatId],
      });
      expect(second.status).toBe('PENDING');
      expect(second.bookingId).not.toBe(first.bookingId);
    }, 30000);
  });

  describe('6. Webhook over live Postgres + Redis', () => {
    it('confirms the booking and issues tickets on PAID', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[1].id;
      const userId = '00000000-0000-0000-0000-000000000071';

      const hold = await bookingsService.hold({
        userId,
        showtimeId,
        seatIds: [seatId],
      });

      await bookingsService.webhook({
        signature: 'tok',
        body: JSON.stringify({
          id: 'inv_live_1',
          external_id: `cix-${hold.bookingId}`,
          status: 'PAID',
          paid_at: new Date().toISOString(),
        }),
      });

      const bookingInDb = await dataSource
        .getRepository(Booking)
        .findOneBy({ id: hold.bookingId });
      expect(bookingInDb?.status).toBe('CONFIRMED');

      const tickets = await bookingsService.createTickets({
        id: hold.bookingId,
        userId,
      });
      expect(tickets.items).toHaveLength(1);
      expect(tickets.items[0].code).toMatch(/^TKT-/);
    }, 30000);

    it('rejects a late PAID with 410 once the hold expired', async () => {
      const showtimeId = mockSeatMap.showtimeId;
      const seatId = mockSeatMap.seats[0].id;
      const userId = '00000000-0000-0000-0000-000000000072';

      const hold = await bookingsService.hold({
        userId,
        showtimeId,
        seatIds: [seatId],
      });

      await dataSource
        .getRepository(Booking)
        .update(
          { id: hold.bookingId },
          { expiresAt: new Date(Date.now() - 1000) },
        );

      let error: unknown;
      try {
        await bookingsService.webhook({
          signature: 'tok',
          body: JSON.stringify({
            id: 'inv_live_2',
            external_id: `cix-${hold.bookingId}`,
            status: 'PAID',
            paid_at: new Date().toISOString(),
          }),
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(RpcException);
      expect(rpcStatus(error)).toBe(410);

      const bookingInDb = await dataSource
        .getRepository(Booking)
        .findOneBy({ id: hold.bookingId });
      expect(bookingInDb?.status).toBe('EXPIRED');
    }, 30000);
  });
});
