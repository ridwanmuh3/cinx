import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ } from '@ticketing/shared';
import {
  TICKET_EVENTS_CLIENT,
  TicketEventsPublisher,
} from './ticket-events.publisher';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: TICKET_EVENTS_CLIENT,
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
  providers: [TicketEventsPublisher],
  exports: [TicketEventsPublisher],
})
export class EventsModule {}
