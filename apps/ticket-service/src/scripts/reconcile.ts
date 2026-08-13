import 'reflect-metadata';
import { DataSource, LessThan } from 'typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { BookingSeat } from '../bookings/booking-seat.entity';
import { Booking } from '../bookings/booking.entity';
import { Payment } from '../bookings/payment.entity';
import { Ticket } from '../bookings/ticket.entity';

/**
 * Standalone reconciliation: expire stale PENDING bookings. Redis locks are
 * auto-released by their TTL, so only the DB rows need flipping to EXPIRED.
 */
async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: buildPgUrl(PG_DBS.TICKET),
    entities: [Booking, BookingSeat, Payment, Ticket],
    synchronize: true,
  });
  await ds.initialize();

  const repo = ds.getRepository(Booking);
  const stale = await repo.find({
    where: { status: 'PENDING', expiresAt: LessThan(new Date()) },
  });

  const ids: string[] = [];
  for (const b of stale) {
    b.status = 'EXPIRED';
    await repo.save(b);
    ids.push(b.id);
  }

  console.log(
    `[reconcile] expired ${ids.length} stale PENDING booking(s): ${ids.join(', ')}`,
  );
  await ds.destroy();
}

void main().catch((err) => {
  console.error('[reconcile] FAILED', err);
  process.exitCode = 1;
});
