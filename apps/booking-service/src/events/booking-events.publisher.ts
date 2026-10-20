import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import {
  BookingCancelledData,
  BookingConfirmedData,
  BookingEvents,
  BookingExpiredData,
  BookingRefundedData,
  BookingRefundRequestedData,
  injectTraceHeaders,
  PaymentEvents,
  PaymentReceivedData,
} from '@ticketing/shared';

export const BOOKING_EVENTS_CLIENT = 'BOOKING_EVENTS_CLIENT';

/**
 * Booking-service publishes two kinds of messages on the same topic exchange:
 *
 * - booking.*  — the saga's public state transitions (ticket + payment
 *                services consume these)
 * - payment.received — the customer receipt, consumed by notification-service
 *
 * All payloads are self-contained; consumers never call back synchronously.
 */
@Injectable()
export class BookingEventsPublisher {
  constructor(
    @Inject(BOOKING_EVENTS_CLIENT) private readonly client: ClientProxy,
  ) {}

  confirmed(data: BookingConfirmedData): Promise<void> {
    return this.publish(BookingEvents.CONFIRMED, data);
  }

  cancelled(data: BookingCancelledData): Promise<void> {
    return this.publish(BookingEvents.CANCELLED, data);
  }

  expired(data: BookingExpiredData): Promise<void> {
    return this.publish(BookingEvents.EXPIRED, data);
  }

  refundRequested(data: BookingRefundRequestedData): Promise<void> {
    return this.publish(BookingEvents.REFUND_REQUESTED, data);
  }

  refunded(data: BookingRefundedData): Promise<void> {
    return this.publish(BookingEvents.REFUNDED, data);
  }

  paymentReceived(data: PaymentReceivedData): Promise<void> {
    return this.publish(PaymentEvents.RECEIVED, data);
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
