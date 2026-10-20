import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsModule } from './bookings/bookings.module';
import { typeOrmConfig } from './database/typeorm.config';
import { HealthModule } from './health/health.module';
import { RedisModule } from './lock/lock.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig),
    ScheduleModule.forRoot(),
    HealthModule,
    RedisModule,
    BookingsModule,
  ],
})
export class AppModule {}
