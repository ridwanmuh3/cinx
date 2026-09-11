import { context, Span, SpanStatusCode, trace } from '@opentelemetry/api';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Re-exported so apps single-source the API version via @ticketing/shared
// (pnpm does not hoist transitive deps into app scopes).
export {
  context,
  propagation,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
export type { Context, Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  /**
   * Logical service name, e.g. 'gateway'. Defaults to OTEL_SERVICE_NAME.
   */
  serviceName?: string;
  /**
   * OTLP/HTTP endpoint of the collector, e.g.
   * 'http://otel-collector:4318'. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT.
   */
  endpoint?: string;
  /**
   * Head sampling ratio 0..1. Defaults to OTEL_TRACES_SAMPLER_ARG ('1').
   */
  sampleRatio?: number;
  /**
   * Metrics export interval in ms. Defaults to OTEL_METRIC_EXPORT_INTERVAL
   * ('60000').
   */
  metricIntervalMs?: number;
}

function parseRatio(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function parseInterval(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Bootstrap OpenTelemetry tracing + metrics for a NestJS service.
 *
 * MUST be called (or its module imported) before any other application
 * imports — auto-instrumentation patches http/grpc/pg/ioredis at require
 * time. Each service calls this exactly once in main.ts:
 *
 *   import { initTelemetry } from '@ticketing/shared';
 *   initTelemetry('gateway');
 *
 * Honors the standard env vars: OTEL_SDK_DISABLED, OTEL_SERVICE_NAME,
 * OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_TRACES_SAMPLER_ARG,
 * OTEL_METRIC_EXPORT_INTERVAL. Safe to call in tests: when
 * OTEL_SDK_DISABLED=true it only logs and returns null.
 */
export function initTelemetry(options?: string | TelemetryOptions) {
  const opts: TelemetryOptions =
    typeof options === 'string' ? { serviceName: options } : (options ?? {});

  if (process.env.OTEL_SDK_DISABLED === 'true') {
    console.log('[otel] SDK disabled via OTEL_SDK_DISABLED, skipping init');
    return null;
  }

  const serviceName =
    opts.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'unknown-service';
  const endpoint =
    opts.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    'http://otel-collector:4318';
  const sampleRatio = parseRatio(
    opts.sampleRatio !== undefined
      ? String(opts.sampleRatio)
      : process.env.OTEL_TRACES_SAMPLER_ARG,
    1,
  );
  const metricIntervalMs = parseInterval(
    opts.metricIntervalMs !== undefined
      ? String(opts.metricIntervalMs)
      : process.env.OTEL_METRIC_EXPORT_INTERVAL,
    60000,
  );
  const deployEnv =
    process.env.DEPLOY_ENV ?? process.env.NODE_ENV ?? 'development';

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    'service.namespace': 'ticketing-cinema',
    'deployment.environment.name': deployEnv,
  });

  const sdk = new NodeSDK({
    resource,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRatio),
    }),
    spanProcessor: new BatchSpanProcessor(
      new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    ),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: metricIntervalMs,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // grpc + nestjs get dedicated, tuned instrumentations below.
        '@opentelemetry/instrumentation-grpc': { enabled: false },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: false },
        // Keep http spans lean: no per-request target/query attrs.
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) =>
            req.url === '/api/v1/health' ||
            req.url === '/health' ||
            req.url === '/favicon.ico',
        },
        // pg statements can contain literals; keep the operation name only.
        '@opentelemetry/instrumentation-pg': {
          enhancedDatabaseReporting: false,
        },
      }),
      new GrpcInstrumentation(),
      new NestInstrumentation(),
    ],
  });

  try {
    sdk.start();
  } catch (err) {
    // Telemetry must never take the service down (e.g. duplicate
    // registration in tests that import main twice).
    console.warn(
      '[otel] failed to start SDK, continuing without telemetry',
      err,
    );
    return null;
  }

  const shutdown = () => {
    sdk
      .shutdown()
      .then(() => console.log('[otel] SDK shut down'))
      .catch((err) => console.warn('[otel] shutdown error', err));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  console.log(
    `[otel] tracing+metrics enabled for '${serviceName}' -> ${endpoint} (sample=${sampleRatio})`,
  );
  return sdk;
}

export type SpanAttributes = Record<string, string | number | boolean>;

/**
 * Run `fn` inside a span that is a child of the active context. The span
 * inherits the ambient trace (HTTP/gRPC server span when called from a
 * request handler), records errors, and always ends. `fn` receives the span
 * so it can set result attributes (keep values low-cardinality; no PII).
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: SpanAttributes,
): Promise<T> {
  const tracer = trace.getTracer('ticketing-cinema');
  return tracer.startActiveSpan(
    name,
    { attributes },
    context.active(),
    async (span) => {
      try {
        const result = await fn(span);
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
    },
  );
}
