import { Counter, metrics } from '@opentelemetry/api';

export interface BookingMeters {
  /** Seat-hold attempts. `status`: held | conflict | unavailable | error. */
  holds: Counter;
  /** Booking confirmations. `status`: confirmed | expired | error. */
  confirms: Counter;
  /** Xendit webhook callbacks. `status`: the mapped outcome (paid, expired, …). */
  webhooks: Counter;
}

let cached: BookingMeters | null = null;

/**
 * Business counters for the booking flow. Safe to call before the SDK
 * starts (the global API returns no-op instruments until then).
 */
export function getBookingMeters(): BookingMeters {
  if (!cached) {
    const meter = metrics.getMeter('ticketing-cinema');
    cached = {
      holds: meter.createCounter('booking.holds', {
        description: 'Seat hold attempts by outcome',
      }),
      confirms: meter.createCounter('booking.confirms', {
        description: 'Booking confirmations by outcome',
      }),
      webhooks: meter.createCounter('payment.webhook.received', {
        description: 'Xendit webhook callbacks by outcome',
      }),
    };
  }
  return cached;
}
