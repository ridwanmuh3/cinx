import { Controller, Logger, UseInterceptors } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import {
  TicketsIssuedData,
  PaymentReceivedData,
  PaymentEvents,
  TicketEvents,
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

  @EventPattern(TicketEvents.ISSUED)
  async bookingConfirmed(data: TicketsIssuedData) {
    this.logger.log(`tickets.issued ${data.bookingId}`);
    if (!data.recipient) {
      this.logger.warn(`no recipient for booking ${data.bookingId}; skipping`);
      return;
    }
    const res = await this.resend.sendBookingConfirmation(data);
    if (!res.accepted)
      this.logger.warn(`confirmation email not sent: ${res.error}`);
  }

  @EventPattern(PaymentEvents.RECEIVED)
  async paymentReceived(data: PaymentReceivedData) {
    this.logger.log(`payment.received ${data.bookingId}`);
    if (!data.recipient) {
      this.logger.warn(`no recipient for booking ${data.bookingId}; skipping`);
      return;
    }
    const res: EmailResult = await this.resend.sendPaymentReceipt(data);
    if (!res.accepted) this.logger.warn(`receipt email not sent: ${res.error}`);
  }
}
