import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import {
  PaymentEvents,
  PaymentFailedData,
  PaymentRefundFailedData,
  PaymentRefundPendingData,
  PaymentRefundedData,
  PaymentSettledData,
} from '@ticketing/shared';
import { BookingsService } from './bookings.service';

/**
 * Payment-service is the only writer of payment_db; booking-service learns
 * about money via these events. At-least-once delivery, idempotent handlers.
 */
@Controller()
export class PaymentEventsConsumer {
  constructor(private readonly bookings: BookingsService) {}

  @EventPattern(PaymentEvents.SETTLED)
  onSettled(data: PaymentSettledData): Promise<void> {
    return this.bookings.onPaymentSettled(data);
  }

  @EventPattern(PaymentEvents.FAILED)
  onFailed(data: PaymentFailedData): Promise<void> {
    return this.bookings.onPaymentFailed(data);
  }

  @EventPattern(PaymentEvents.REFUND_PENDING)
  onRefundPending(data: PaymentRefundPendingData): Promise<void> {
    return this.bookings.onRefundPending(data);
  }

  @EventPattern(PaymentEvents.REFUNDED)
  onRefunded(data: PaymentRefundedData): Promise<void> {
    return this.bookings.onRefunded(data);
  }

  @EventPattern(PaymentEvents.REFUND_FAILED)
  onRefundFailed(data: PaymentRefundFailedData): Promise<void> {
    return this.bookings.onRefundFailed(data);
  }
}
