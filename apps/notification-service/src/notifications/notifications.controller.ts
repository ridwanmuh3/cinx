import { Controller, Logger, UseInterceptors } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import {
  BookingConfirmationData,
  PaymentReceiptData,
  NotificationPatterns,
  EmailResult,
  RmqTraceInterceptor,
} from '@ticketing/shared';
import { ResendService } from './resend.service';

// Links each consumed message to the producer trace via the traceparent
// stamped into the AMQP headers (see injectTraceHeaders).
@UseInterceptors(RmqTraceInterceptor)
@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly resend: ResendService) {}

  @EventPattern(NotificationPatterns.BOOKING_CONFIRMED)
  async bookingConfirmed(data: BookingConfirmationData) {
    this.logger.log(`booking.confirmed ${data.bookingId}`);
    const res = await this.resend.sendBookingConfirmation(data);
    if (!res.accepted)
      this.logger.warn(`confirmation email not sent: ${res.error}`);
  }

  @EventPattern(NotificationPatterns.PAYMENT_RECEIVED)
  async paymentReceived(data: PaymentReceiptData) {
    this.logger.log(`payment.received ${data.bookingId}`);
    const res: EmailResult = await this.resend.sendPaymentReceipt(data);
    if (!res.accepted) this.logger.warn(`receipt email not sent: ${res.error}`);
  }
}
