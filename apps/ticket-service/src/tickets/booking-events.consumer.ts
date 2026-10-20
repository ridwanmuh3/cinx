import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import {
  BookingCancelledData,
  BookingConfirmedData,
  BookingEvents,
  BookingExpiredData,
  BookingRefundedData,
} from '@ticketing/shared';
import { TicketEventsPublisher } from '../events/ticket-events.publisher';
import { TicketsService } from './tickets.service';

/**
 * ticket-service is a pure consumer of booking state. It owns tickets only:
 * `booking.confirmed` creates them, terminal events void them. Every handler
 * is idempotent and republishes its outcome so a lost `tickets.issued` can be
 * recovered by booking-service's confirmation retry.
 */
@Controller()
export class BookingEventsConsumer {
  constructor(
    private readonly tickets: TicketsService,
    private readonly events: TicketEventsPublisher,
  ) {}

  @EventPattern(BookingEvents.CONFIRMED)
  async onConfirmed(data: BookingConfirmedData): Promise<void> {
    const rows = await this.tickets.issue({
      bookingId: data.bookingId,
      userId: data.userId,
      showtimeId: data.showtimeId,
      movieTitle: data.movieTitle,
      theaterName: data.theaterName,
      startsAt: data.startsAt,
      seats: data.seats.map((seat) => ({
        seatId: seat.seatId,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
      })),
    });

    await this.events.issued({
      recipient: data.recipient,
      bookingId: data.bookingId,
      userId: data.userId,
      showtimeId: data.showtimeId,
      totalAmount: data.totalAmount,
      currency: data.currency,
      movieTitle: data.movieTitle,
      theaterName: data.theaterName,
      startsAt: data.startsAt,
      seats: data.seats,
      tickets: rows.map((ticket) => ({
        code: ticket.code,
        seatId: ticket.seatId,
        rowLabel: ticket.rowLabel,
        seatNumber: ticket.seatNumber,
      })),
      confirmedAt: data.confirmedAt,
    });
  }

  @EventPattern(BookingEvents.REFUNDED)
  onRefunded(data: BookingRefundedData): Promise<void> {
    return this.void(data.bookingId);
  }

  @EventPattern(BookingEvents.CANCELLED)
  onCancelled(data: BookingCancelledData): Promise<void> {
    return this.void(data.bookingId);
  }

  @EventPattern(BookingEvents.EXPIRED)
  onExpired(data: BookingExpiredData): Promise<void> {
    return this.void(data.bookingId);
  }

  private async void(bookingId: string): Promise<void> {
    await this.tickets.void(bookingId);
    await this.events.voided({ bookingId });
  }
}
