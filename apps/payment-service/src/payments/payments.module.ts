import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { BookingEventsConsumer } from './booking-events.consumer';
import { Payment } from './payment.entity';
import { PAYMENT_PROVIDER } from './payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { XenditProvider } from './xendit.provider';

@Module({
  imports: [TypeOrmModule.forFeature([Payment]), EventsModule],
  controllers: [PaymentsController, BookingEventsConsumer],
  providers: [
    PaymentsService,
    { provide: PAYMENT_PROVIDER, useClass: XenditProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
