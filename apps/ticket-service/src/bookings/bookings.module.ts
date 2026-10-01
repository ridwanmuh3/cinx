import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CinemaClientModule } from '../cinema/cinema-client.module';
import { EventsModule } from '../events/events.module';
import { PaymentService } from '../payments/payment.service';
import { XenditClient } from '../payments/xendit.client';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';
import { UserClientModule } from '../user/user-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSeat, Payment, Ticket]),
    CinemaClientModule,
    UserClientModule,
    EventsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, PaymentService, XenditClient],
  exports: [PaymentService],
})
export class BookingsModule {}
