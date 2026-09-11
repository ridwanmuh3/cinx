import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CinemaModule } from './cinema/cinema.module';
import { ServiceClientsModule } from './clients/service-clients.module';
import { HealthModule } from './health/health.module';
import { OtelModule } from './otel/otel.module';

@Module({
  imports: [
    ServiceClientsModule,
    HealthModule,
    AuthModule,
    CinemaModule,
    BookingsModule,
    OtelModule,
  ],
})
export class AppModule {}
