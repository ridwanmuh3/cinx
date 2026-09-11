import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { HealthResponse, HealthPatterns } from '@ticketing/shared';

@Controller()
export class HealthController {
  @GrpcMethod('CinemaService', HealthPatterns.PING)
  ping(): HealthResponse {
    return {
      service: 'cinema-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
