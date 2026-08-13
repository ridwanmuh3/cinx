import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './database/typeorm.config';
import { HealthModule } from './health/health.module';
import { CinemaModule } from './cinema/cinema.module';

@Module({
  imports: [TypeOrmModule.forRoot(typeOrmConfig), HealthModule, CinemaModule],
})
export class AppModule {}
