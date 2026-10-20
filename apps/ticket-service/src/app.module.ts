import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './database/typeorm.config';
import { HealthModule } from './health/health.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [TypeOrmModule.forRoot(typeOrmConfig), HealthModule, TicketsModule],
})
export class AppModule {}
