import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { HealthPatterns, HealthResponse } from '@ticketing/shared';

@Controller()
export class HealthController {
  @GrpcMethod('TicketService', HealthPatterns.PING)
  ping(): HealthResponse {
    return {
      service: 'ticket-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
