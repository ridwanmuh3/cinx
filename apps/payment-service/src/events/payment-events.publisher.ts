import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import {
  injectTraceHeaders,
  PaymentEvents,
  PaymentFailedData,
  PaymentRefundFailedData,
  PaymentRefundPendingData,
  PaymentRefundedData,
  PaymentSettledData,
} from '@ticketing/shared';

export const PAYMENT_EVENTS_CLIENT = 'PAYMENT_EVENTS_CLIENT';

/** Publishes payment state transitions on the internal topic exchange. */
@Injectable()
export class PaymentEventsPublisher {
  constructor(
    @Inject(PAYMENT_EVENTS_CLIENT) private readonly client: ClientProxy,
  ) {}

  settled(data: PaymentSettledData): Promise<void> {
    return this.publish(PaymentEvents.SETTLED, data);
  }

  failed(data: PaymentFailedData): Promise<void> {
    return this.publish(PaymentEvents.FAILED, data);
  }

  refundPending(data: PaymentRefundPendingData): Promise<void> {
    return this.publish(PaymentEvents.REFUND_PENDING, data);
  }

  refunded(data: PaymentRefundedData): Promise<void> {
    return this.publish(PaymentEvents.REFUNDED, data);
  }

  refundFailed(data: PaymentRefundFailedData): Promise<void> {
    return this.publish(PaymentEvents.REFUND_FAILED, data);
  }

  private async publish(pattern: string, payload: object): Promise<void> {
    const record = new RmqRecordBuilder(payload)
      .setOptions({ headers: injectTraceHeaders() })
      .build();

    await new Promise<void>((resolve, reject) => {
      this.client.emit(pattern, record).subscribe({
        error: (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        complete: () => resolve(),
      });
    });
  }
}
