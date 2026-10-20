import { Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import {
  BookingCancelledData,
  BookingEvents,
  BookingExpiredData,
  BookingRefundRequestedData,
} from '@ticketing/shared';
import { PaymentsService } from './payments.service';

/**
 * Booking-service tells payment-service when a booking is cancelled or
 * expired, and asks for a refund after a paid cancellation. Delivery is
 * at-least-once; every operation here is idempotent.
 */
@Controller()
export class BookingEventsConsumer {
  private readonly logger = new Logger(BookingEventsConsumer.name);

  constructor(private readonly payments: PaymentsService) {}

  @EventPattern(BookingEvents.REFUND_REQUESTED)
  async onRefundRequested(data: BookingRefundRequestedData): Promise<void> {
    await this.payments.requestRefund(data);
  }

  @EventPattern(BookingEvents.CANCELLED)
  async onCancelled(data: BookingCancelledData): Promise<void> {
    await this.payments.expireInvoice(data.bookingId);
  }

  @EventPattern(BookingEvents.EXPIRED)
  async onExpired(data: BookingExpiredData): Promise<void> {
    await this.payments.expireInvoice(data.bookingId);
  }
}
