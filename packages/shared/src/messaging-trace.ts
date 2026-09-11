import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import {
  Context,
  context,
  propagation,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { Observable } from 'rxjs';

export const TRACEPARENT_HEADER = 'traceparent';
export const TRACESTATE_HEADER = 'tracestate';

type HeaderCarrier = Record<string, unknown>;

function setter(carrier: HeaderCarrier, key: string, value: string): void {
  carrier[key] = value;
}

function getter(carrier: HeaderCarrier, key: string): string | undefined {
  const value = carrier[key];
  return typeof value === 'string' ? value : undefined;
}

function keys(carrier: HeaderCarrier): string[] {
  return Object.keys(carrier);
}

/**
 * Stamp the active trace context (W3C traceparent/tracestate) into an
 * outgoing message header map. Use on every RMQ publish so the consumer can
 * link its processing span to the producer trace:
 *
 *   await client.emit(pattern, { ...payload, headers: injectTraceHeaders() });
 */
export function injectTraceHeaders(headers: HeaderCarrier = {}): HeaderCarrier {
  const out: HeaderCarrier = { ...headers };
  propagation.inject(context.active(), out, { set: setter });
  return out;
}

/**
 * Recover the producer trace context from incoming message headers.
 * Returns the active context unchanged when no traceparent is present.
 */
export function extractTraceContext(headers?: HeaderCarrier | null): Context {
  if (!headers) return context.active();
  return propagation.extract(context.active(), headers, {
    get: getter,
    keys,
  });
}

/**
 * Run `fn` inside a span that is a child of the given parent context.
 * The span ends when the returned promise settles (error recorded).
 */
export async function withChildSpan<T>(
  name: string,
  parent: Context,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = trace.getTracer('ticketing-cinema');
  return tracer.startActiveSpan(name, { attributes }, parent, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Nest interceptor for RMQ @EventPattern/@MessagePattern handlers. Extracts
 * the producer trace context from the AMQP message headers (populated by
 * injectTraceHeaders on publish) and runs the handler inside it, so the
 * consumer span joins the end-to-end booking trace instead of starting a
 * detached one. Also tags the active span with pattern + queue.
 *
 * Usage: @UseInterceptors(RmqTraceInterceptor) on the controller.
 */
@Injectable()
export class RmqTraceInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rmq = ctx.switchToRpc().getContext<RmqContext>();
    let parent: Context = context.active();
    let pattern = 'unknown';
    try {
      const message = rmq.getMessage() as
        | {
            properties?: { headers?: HeaderCarrier };
            fields?: { routingKey?: string };
          }
        | undefined;
      pattern =
        rmq.getPattern() !== undefined
          ? String(rmq.getPattern())
          : (message?.fields?.routingKey ?? 'unknown');
      parent = extractTraceContext(message?.properties?.headers);
    } catch {
      // Header parsing must never break message handling.
    }
    const tracer = trace.getTracer('ticketing-cinema');
    const span = tracer.startSpan('rmq.consume', undefined, parent);
    span.setAttributes({
      'messaging.system': 'rabbitmq',
      'messaging.operation': 'process',
      'messaging.destination': pattern,
    });
    return new Observable<unknown>((subscriber) => {
      const sub = context.with(trace.setSpan(parent, span), () =>
        next.handle().subscribe(subscriber),
      );
      return () => {
        sub.unsubscribe();
        span.end();
      };
    });
  }
}
