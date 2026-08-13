import { Module } from '@nestjs/common';
import { CinemaModule } from '../cinema/cinema.module';
import { ServiceClientsModule } from '../clients/service-clients.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [ServiceClientsModule, CinemaModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
