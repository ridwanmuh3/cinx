import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { BookingSeat } from '../bookings/booking-seat.entity';
import { Booking } from '../bookings/booking.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: buildPgUrl(PG_DBS.BOOKING),
  entities: [Booking, BookingSeat],
  synchronize: true,
  autoLoadEntities: false,
};
