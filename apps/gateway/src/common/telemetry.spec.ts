import {
  extractTraceContext,
  getBookingMeters,
  initTelemetry,
  injectTraceHeaders,
  withSpan,
} from '@ticketing/shared';

describe('telemetry helpers', () => {
  const prev = process.env.OTEL_SDK_DISABLED;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.OTEL_SDK_DISABLED;
    } else {
      process.env.OTEL_SDK_DISABLED = prev;
    }
  });

  it('initTelemetry no-ops when OTEL_SDK_DISABLED=true', () => {
    process.env.OTEL_SDK_DISABLED = 'true';
    expect(initTelemetry('test-svc')).toBeNull();
  });

  it('withSpan runs fn and returns its value without a started SDK', async () => {
    await expect(
      withSpan('test.span', (span) => {
        span.setAttribute('k', 'v');
        return Promise.resolve(42);
      }),
    ).resolves.toBe(42);
  });

  it('booking meters accept increments without a started SDK', () => {
    const meters = getBookingMeters();
    expect(() => {
      meters.holds.add(1, { status: 'held' });
      meters.confirms.add(1, { status: 'confirmed' });
      meters.webhooks.add(1, { status: 'paid' });
    }).not.toThrow();
  });

  it('inject/extract round-trips trace context through headers', () => {
    const headers = injectTraceHeaders({ 'x-custom': '1' });
    expect(headers['x-custom']).toBe('1');
    // No active span -> no traceparent stamped, extract is identity-safe.
    expect(extractTraceContext(headers)).toBeDefined();
    expect(extractTraceContext(null)).toBeDefined();
  });
});
