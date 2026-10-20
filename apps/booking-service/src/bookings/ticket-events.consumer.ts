import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { TicketEvents, TicketsIssuedData } from '@ticketing/shared';
import { BookingsService } from './bookings.service';

/**
 * ticket-service confirms issuance, which is what moves a paid PENDING
 * booking to CONFIRMED. The gateway only ever sees the projection.
 */
@Controller()
export class TicketEventsConsumer {
  constructor(private readonly bookings: BookingsService) {}

  @EventPattern(TicketEvents.ISSUED)
  onIssued(data: TicketsIssuedData): Promise<void> {
    return this.bookings.onTicketsIssued(data);
  }
}
