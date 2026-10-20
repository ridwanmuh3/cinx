import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Observable, catchError, tap, throwError } from 'rxjs';

/**
 * Manual acknowledgement for durable RMQ event consumers.
 *
 * Nest does not ack `@EventPattern` handlers itself, so a `noAck: false`
 * consumer would leave every message unacked forever. Ack after the handler
 * resolves; nack without requeue on failure. The failure path is intentionally
 * terminal: booking/payment/ticket each have retry crons, and requeueing a
 * poison message forever would block the queue.
 */
@Injectable()
export class RmqAckInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RmqAckInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') return next.handle();

    const rmq = context.switchToRpc().getContext<RmqContext>();
    if (!(rmq instanceof RmqContext)) return next.handle();

    const channel = rmq.getChannelRef();
    const message = rmq.getMessage();
    if (!channel || !message) return next.handle();

    return next.handle().pipe(
      tap(() => channel.ack(message)),
      catchError((err: unknown) => {
        this.logger.error(
          `event handler failed; nacking message (no requeue): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        channel.nack(message, false, false);
        return throwError(() => err);
      }),
    );
  }
}
