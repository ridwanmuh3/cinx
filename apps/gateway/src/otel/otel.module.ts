import { Module } from '@nestjs/common';
import { OtelController } from './otel.controller';

@Module({
  controllers: [OtelController],
})
export class OtelModule {}
