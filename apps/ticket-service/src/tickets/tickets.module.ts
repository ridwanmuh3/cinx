import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { BookingEventsConsumer } from './booking-events.consumer';
import { Ticket } from './ticket.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket]), EventsModule],
  controllers: [TicketsController, BookingEventsConsumer],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
