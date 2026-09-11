import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { trace } from '@ticketing/shared';
import { Observable } from 'rxjs';

/**
 * Tags the active (auto-instrumented HTTP server) span with low-cardinality
 * caller attributes. Only the role is recorded — never user IDs, emails, or
 * other PII.
 */
@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    try {
      if (context.getType() === 'http') {
        const req = context
          .switchToHttp()
          .getRequest<{ user?: { role?: unknown } }>();
        const role = req?.user?.role;
        if (typeof role === 'string' && role.length > 0) {
          trace.getActiveSpan()?.setAttribute('enduser.role', role);
        }
      }
    } catch {
      // Telemetry must never break request handling.
    }
    return next.handle();
  }
}
