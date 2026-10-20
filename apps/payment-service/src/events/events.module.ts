import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ } from '@ticketing/shared';
import {
  PAYMENT_EVENTS_CLIENT,
  PaymentEventsPublisher,
} from './payment-events.publisher';

/**
 * RMQ producer for payment-domain events.
 *
 * booking-service owns the durable queue and binds it to the topic exchange;
 * this producer only asserts the exchange and publishes. Events published
 * before the consumer binds are not a correctness problem: booking-service
 * has retry crons and payment status is also reconciled on demand.
 */
@Module({
  imports: [
    ClientsModule.register([
      {
        name: PAYMENT_EVENTS_CLIENT,
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
  providers: [PaymentEventsPublisher],
  exports: [PaymentEventsPublisher],
})
export class EventsModule {}
