import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ } from '@ticketing/shared';
import {
  BOOKING_EVENTS_CLIENT,
  BookingEventsPublisher,
} from './booking-events.publisher';

/**
 * Producer for booking-domain events on the internal topic exchange.
 * Consumers declare their own durable queues and bind the routing keys they
 * care about.
 */
@Module({
  imports: [
    ClientsModule.register([
      {
        name: BOOKING_EVENTS_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [RMQ.URL],
          exchange: RMQ.INTERNAL_EXCHANGE,
          exchangeType: RMQ.INTERNAL_EXCHANGE_TYPE,
          wildcards: true,
          persistent: true,
        },
      },
    ]),
  ],
  providers: [BookingEventsPublisher],
  exports: [BookingEventsPublisher],
})
export class EventsModule {}
