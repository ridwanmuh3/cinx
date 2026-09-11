import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const ALLOWED_SUFFIXES = new Set(['/v1/traces', '/v1/metrics']);

/**
 * Same-origin OTLP relay for browser telemetry (`VITE_OTEL_ENDPOINT`).
 *
 * The Vue SPA cannot reach `otel-collector:4318` (internal network), so it
 * POSTs OTLP/HTTP here and the gateway forwards to the collector. Only the
 * two OTLP signal paths are allowed, bodies are size-capped, and nothing is
 * parsed or stored. Intentionally unauthenticated: logged-out visitors
 * browsing movies also emit spans.
 */
@Controller('otel')
export class OtelController {
  private readonly target = (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'
  ).replace(/\/$/, '');

  @All(['v1/traces', 'v1/metrics'])
  async relay(@Req() req: Request, @Res() res: Response): Promise<void> {
    const suffix = req.path.endsWith('/v1/metrics')
      ? '/v1/metrics'
      : '/v1/traces';
    if (!ALLOWED_SUFFIXES.has(suffix)) {
      res.status(404).end();
      return;
    }
    const declared = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      res.status(413).end();
      return;
    }
    try {
      const upstream = await fetch(`${this.target}${suffix}`, {
        method: 'POST',
        headers: {
          'content-type':
            (req.headers['content-type'] as string | undefined) ??
            'application/json',
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const text = await upstream.text();
      res.status(upstream.status).type('application/json').send(text);
    } catch {
      res.status(502).end();
    }
  }
}
