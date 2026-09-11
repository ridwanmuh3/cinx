import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

function parseRatio(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

let started = false;

/**
 * Browser tracing for the CinX SPA. Sends spans to the gateway's OTLP proxy
 * (same origin, so no extra CORS story) which relays to the collector.
 * `traceparent` is propagated on same-origin fetches, linking page
 * interactions to the backend booking trace.
 *
 * Never throws: telemetry must not break the app when the endpoint is
 * missing or the browser blocks the beacon.
 */
export function initBrowserTelemetry(): void {
  if (started) return;
  started = true;
  try {
    const endpoint = import.meta.env.VITE_OTEL_ENDPOINT as string | undefined;
    if (!endpoint) {
      console.info('[otel] VITE_OTEL_ENDPOINT unset, browser tracing disabled');
      return;
    }
    const sampleRatio = parseRatio(
      import.meta.env.VITE_OTEL_SAMPLE_RATIO as string | undefined,
      0.2,
    );

    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'web',
        'service.namespace': 'ticketing-cinema',
        'deployment.environment.name':
          (import.meta.env.MODE as string | undefined) ?? 'development',
      }),
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(sampleRatio),
      }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
      ],
    });
    provider.register({ contextManager: new ZoneContextManager() });

    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new FetchInstrumentation({
          // Propagate context to our own API; never leak traceparent
          // to third parties (posters, fonts, …).
          propagateTraceHeaderCorsUrls: [/^\/api\//, /^https?:\/\/localhost:3000\//],
          clearTimingResources: true,
        }),
      ],
    });

    console.info(`[otel] browser tracing enabled -> ${endpoint}`);
  } catch (err) {
    console.warn('[otel] failed to start browser telemetry', err);
  }
}
