import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CinemaClientModule } from '../cinema/cinema-client.module';
import { MockPaymentService } from '../payments/mock-payment.service';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSeat, Payment, Ticket]),
    CinemaClientModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, MockPaymentService],
})
export class BookingsModule {}
