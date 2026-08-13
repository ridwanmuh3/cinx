import { Injectable } from '@nestjs/common';
import { MockSimulation, PaymentMethod } from '@ticketing/shared';

const DEFAULT_DELAY_MS = 300;

export interface PaymentResult {
  providerId: string;
  paid: boolean;
  providerTxnId: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
}

/**
 * Mock payment provider. Simulates a payment gateway with configurable
 * success/failure behaviour and a small artificial delay so the flow
 * mirrors real-world latency.
 *
 * Override behaviour at runtime:
 *  - env `MOCK_PAYMENT_FORCE_SUCCESS=true|false`
 *  - env `MOCK_PAYMENT_DELAY_MS=<n>`
 */
@Injectable()
export class MockPaymentService {
  private readonly forceSuccess: boolean | undefined;
  private readonly delayMs: number;

  constructor() {
    const envForce = process.env.MOCK_PAYMENT_FORCE_SUCCESS;
    this.forceSuccess =
      envForce === undefined ? undefined : envForce === 'true';
    this.delayMs = Number(
      process.env.MOCK_PAYMENT_DELAY_MS ?? DEFAULT_DELAY_MS,
    );
  }

  async charge(simulate?: MockSimulation): Promise<PaymentResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const providerId = this.newProviderId();
    const paid =
      this.forceSuccess ??
      (simulate !== undefined
        ? simulate === 'SUCCESS'
        : this.simulateSuccess());

    return {
      providerId,
      paid,
      providerTxnId: paid ? `txn_${Date.now()}` : null,
      paidAt: paid ? new Date().toISOString() : null,
      receiptUrl: paid
        ? `https://mock.example.com/receipts/${providerId}`
        : null,
    };
  }

  /** Generate a provider reference (used when a payment row is created). */
  newProviderId(): string {
    return `mop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  method(): PaymentMethod {
    return 'MOCK';
  }

  /** Default simulation: always succeeds (gateway is healthy by default). */
  private simulateSuccess(): boolean {
    return true;
  }
}
