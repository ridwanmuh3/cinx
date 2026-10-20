import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CinemaClientModule } from '../cinema/cinema-client.module';
import { EventsModule } from '../events/events.module';
import { UserClientModule } from '../user/user-client.module';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PaymentEventsConsumer } from './payment-events.consumer';
import { TicketEventsConsumer } from './ticket-events.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSeat]),
    CinemaClientModule,
    UserClientModule,
    EventsModule,
  ],
  controllers: [
    BookingsController,
    PaymentEventsConsumer,
    TicketEventsConsumer,
  ],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
