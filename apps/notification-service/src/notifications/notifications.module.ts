import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { ResendService } from './resend.service';

@Module({
  controllers: [NotificationsController],
  providers: [ResendService],
  exports: [ResendService],
})
export class NotificationsModule {}
