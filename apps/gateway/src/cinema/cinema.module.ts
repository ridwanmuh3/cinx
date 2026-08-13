import { Module } from '@nestjs/common';
import { ServiceClientsModule } from '../clients/service-clients.module';
import { CinemaController } from './cinema.controller';
import { CinemaService } from './cinema.service';

@Module({
  imports: [ServiceClientsModule],
  controllers: [CinemaController],
  providers: [CinemaService],
  exports: [CinemaService],
})
export class CinemaModule {}
