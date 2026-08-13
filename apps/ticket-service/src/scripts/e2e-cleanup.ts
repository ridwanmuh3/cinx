import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { BookingSeat } from '../bookings/booking-seat.entity';
import { Booking } from '../bookings/booking.entity';
import { Payment } from '../bookings/payment.entity';
import { Ticket } from '../bookings/ticket.entity';

/**
 * Standalone E2E cleanup: remove bookings for the e2e user (env E2E_USER_ID)
 * so the Playwright suite always starts from deterministic booking state.
 * Payments, tickets and seats cascade via their FK onDelete.
 */
async function main() {
  const userId = process.env.E2E_USER_ID;
  const ds = new DataSource({
    type: 'postgres',
    url: buildPgUrl(PG_DBS.TICKET),
    entities: [Booking, BookingSeat, Payment, Ticket],
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
