import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import {
  BookingConfirmationData,
  injectTraceHeaders,
  NotificationPatterns,
  PaymentReceiptData,
} from '@ticketing/shared';

export const NOTIFICATION_CLIENT = 'NOTIFICATION_CLIENT';

/**
 * Publishes the booking domain events notification-service consumes.
 *
 * Two events per settled Booking, because they answer different questions:
 * `booking.confirmed` carries the tickets ("here is what you bought"),
 * `payment.received` carries the receipt ("here is what you paid").
 */
@Injectable()
export class BookingEventPublisher {
  constructor(
    @Inject(NOTIFICATION_CLIENT) private readonly client: ClientProxy,
  ) {}

  /** Tickets for a Booking that has been settled. */
  bookingConfirmed(data: BookingConfirmationData): Promise<void> {
    return this.publish(NotificationPatterns.BOOKING_CONFIRMED, data);
  }

  /** Receipt for money actually taken. */
  paymentReceived(data: PaymentReceiptData): Promise<void> {
    return this.publish(NotificationPatterns.PAYMENT_RECEIVED, data);
  }

  private async publish(pattern: string, payload: object): Promise<void> {
    // Trace headers ride as AMQP message properties (that is where
    // RmqTraceInterceptor looks for them), not as part of the payload.
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
