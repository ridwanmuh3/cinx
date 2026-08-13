import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HealthPatterns, HealthResponse } from '@ticketing/shared';

@Controller()
export class HealthController {
  @MessagePattern(HealthPatterns.PING)
  ping(): HealthResponse {
    return {
      service: 'ticket-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
