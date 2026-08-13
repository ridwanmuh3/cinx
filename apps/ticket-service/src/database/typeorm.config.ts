import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { Booking } from '../bookings/booking.entity';
import { BookingSeat } from '../bookings/booking-seat.entity';
import { Payment } from '../bookings/payment.entity';
import { Ticket } from '../bookings/ticket.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: buildPgUrl(PG_DBS.TICKET),
  entities: [Booking, BookingSeat, Payment, Ticket],
  synchronize: true,
  autoLoadEntities: false,
};
