import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BookingsService } from '../bookings/bookings.service';

/**
 * Standalone reconciliation: expire unpaid holds and retry confirmation /
 * refund events. The running service also does this every minute; this script
 * is for operators who need an immediate pass.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const bookings = app.get(BookingsService);
    const expired = await bookings.expireStaleBookings();
    const confirmations = await bookings.retryConfirmations();
    const refunds = await bookings.retryRefunds();
    console.log(
      `[reconcile] expired ${expired.count}, retried ${confirmations.length} confirmation(s), ${refunds.length} refund(s)`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error('[reconcile] FAILED', err);
  process.exitCode = 1;
});
