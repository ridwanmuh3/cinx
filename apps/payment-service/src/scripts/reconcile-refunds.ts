import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PaymentsService } from '../payments/payments.service';

/**
 * Standalone refund reconciliation. The running payment-service also does this
 * every minute; this script is for operators who need an immediate pass (for
 * example after a provider outage).
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const payments = app.get(PaymentsService);
    const result = await payments.reconcileRefunds();
    console.log(
      `[reconcile-refunds] finalized ${result.finalized.length}, reverted ${result.reverted.length}`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error('[reconcile-refunds] FAILED', err);
  process.exitCode = 1;
});
