import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { BookingSeat } from '../bookings/booking-seat.entity';
import { Booking } from '../bookings/booking.entity';

/**
 * Standalone E2E cleanup: remove bookings for the e2e user (env E2E_USER_ID)
 * so the Playwright suite always starts from deterministic booking state.
 * Seat rows cascade via their FK onDelete.
 *
 * Payment and ticket rows are keyed by booking id; they are intentionally left
 * alone here because those services own their databases.
 */
async function main() {
  const userId = process.env.E2E_USER_ID;
  const ds = new DataSource({
    type: 'postgres',
    url: buildPgUrl(PG_DBS.BOOKING),
    entities: [Booking, BookingSeat],
    synchronize: true,
  });
  await ds.initialize();

  const repo = ds.getRepository(Booking);
  const res = userId ? await repo.delete({ userId }) : await repo.delete({});
  console.log(
    `[e2e-cleanup] removed ${res.affected ?? 0} booking(s)${userId ? ` for ${userId}` : ''}`,
  );
  await ds.destroy();
}

void main().catch((err) => {
  console.error('[e2e-cleanup] FAILED', err);
  process.exitCode = 1;
});
