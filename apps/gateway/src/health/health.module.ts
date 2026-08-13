import { Module } from '@nestjs/common';
import { ServiceClientsModule } from '../clients/service-clients.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ServiceClientsModule],
  controllers: [HealthController],
})
export class HealthModule {}
