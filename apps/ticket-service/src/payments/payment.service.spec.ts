import { RpcException } from '@nestjs/microservices';
import { PaymentService } from './payment.service';
import { XenditClient } from './xendit.client';

function statusOf(err: unknown): number | undefined {
  const payload = err instanceof RpcException ? err.getError() : err;
  return (payload as { statusCode?: number } | null)?.statusCode;
}

describe('PaymentService (Xendit)', () => {
  let client: XenditClient;
  let service: PaymentService;

  beforeEach(() => {
    client = new XenditClient();
    service = new PaymentService(client);
    jest.restoreAllMocks();
  });

  it('builds a deterministic external id per booking', () => {
    expect(service.externalIdFor('b1')).toBe('cix-b1');
  });

  it('clamps the invoice duration to the hold window', () => {
    expect(
      service.invoiceDurationFor(new Date(Date.now() + 60_000)),
    ).toBeGreaterThanOrEqual(300);
    expect(
      service.invoiceDurationFor(
        new Date(Date.now() + 10 * 365 * 24 * 3600_000),
      ),
    ).toBeLessThanOrEqual(2 * 24 * 3600);
  });

  describe('successRedirectUrl / failureRedirectUrl', () => {
    it('re-anchors a caller-supplied absolute returnUrl to the configured app origin', () => {
      const result = service.successRedirectUrl(
        'b1',
        'http://localhost:4200/bookings/confirm/b1',
      );
      expect(result).toBe('http://localhost:4200/bookings/confirm/b1');
    });

    it('keeps query strings when sanitizing an absolute returnUrl', () => {
      const result = service.successRedirectUrl(
        'b1',
        'https://evil.example/bookings/confirm/b1?src=x&utm=1',
      );
      expect(result).toBe('http://localhost:4200/bookings/confirm/b1?src=x&utm=1');
    });

    it('rejects protocol-relative host injection', () => {
      const result = service.successRedirectUrl('b1', '//evil.example/bookings/confirm/b1');
      expect(result).toBe('http://localhost:4200/bookings/confirm/b1');
      expect(result).not.toContain('evil.example');
    });

    it('falls back to the confirm path when returnUrl is empty', () => {
      expect(service.successRedirectUrl('b1', '')).toBe(
        'http://localhost:4200/bookings/confirm/b1',
      );
      expect(service.successRedirectUrl('b1')).toBe(
        'http://localhost:4200/bookings/confirm/b1',
      );
    });

    it('prefers XENDIT_RETURN_URL over EMAIL_BASE_URL as the redirect origin', () => {
      process.env.XENDIT_RETURN_URL = 'https://cinx.example.com';
      jest.resetModules();
      const {
        PaymentService: FreshService,
      } = require('./payment.service') as typeof import('./payment.service');
      const fresh = new FreshService(client);
      try {
        expect(fresh.successRedirectUrl('b2')).toBe(
          'https://cinx.example.com/bookings/confirm/b2',
        );
        expect(fresh.failureRedirectUrl('b2')).toBe(
          'https://cinx.example.com/bookings/checkout?bookingId=b2',
        );
      } finally {
        delete process.env.XENDIT_RETURN_URL;
        jest.resetModules();
      }
    });
  });

  it('creates an invoice through the Xendit client', async () => {
    const spy = jest.spyOn(client, 'createInvoice').mockResolvedValue({
      id: 'inv_1',
      external_id: 'cix-b1',
      amount: 100000,
      status: 'PENDING',
      invoice_url: 'https://checkout.xendit.co/inv_1',
    });
    const expiresAt = new Date(Date.now() + 5 * 60_000);

    const result = await service.createInvoiceForBooking({
      bookingId: 'b1',
      amount: 100000,
      currency: 'IDR',
      description: 'CinX booking b1',
      expiresAt,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'cix-b1', amount: 100000 }),
    );
    expect(result).toEqual({
      invoiceId: 'inv_1',
      checkoutUrl: 'https://checkout.xendit.co/inv_1',
      externalId: 'cix-b1',
    });
  });

  it('parses a valid invoice callback', () => {
    const cb = service.parseCallback(
      JSON.stringify({
        id: 'inv_1',
        external_id: 'cix-b1',
        status: 'PAID',
        paid_at: '2026-08-20T11:00:00.000Z',
      }),
    );
    expect(cb).toEqual(
      expect.objectContaining({ id: 'inv_1', status: 'PAID' }),
    );
  });

  it('rejects an invalid webhook body with 400', () => {
    try {
      service.parseCallback('not-json');
      throw new Error('expected to reject');
    } catch (err) {
      expect(statusOf(err)).toBe(400);
    }
  });
});
