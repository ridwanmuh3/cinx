import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ } from '@ticketing/shared';
import {
  BookingEventPublisher,
  NOTIFICATION_CLIENT,
} from './booking-event.publisher';

/**
 * RMQ producer for booking domain events.
 *
 * notification-service declares and binds the durable notification queue to
 * this fanout exchange; the producer only asserts the exchange and publishes.
 * Consequence worth knowing: with a fanout, messages published before any
 * consumer has bound its queue are dropped. That is acceptable here because
 * email is explicitly best-effort (see PLAN.md phase 7, increment C).
 */
@Module({
  imports: [
    ClientsModule.register([
      {
        name: NOTIFICATION_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [RMQ.URL],
          exchange: RMQ.EXCHANGE,
          exchangeType: RMQ.EXCHANGE_TYPE,
          persistent: true,
        },
      },
    ]),
  ],
  providers: [BookingEventPublisher],
  exports: [BookingEventPublisher],
})
export class EventsModule {}
