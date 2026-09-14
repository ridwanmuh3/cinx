import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { timingSafeEqual } from 'node:crypto';
import {
  EMAIL_BASE_URL,
  rpcErrorPayload,
  XenditInvoiceCallback,
  XENDIT_RETURN_URL,
  XENDIT_WEBHOOK_TOKEN,
} from '@ticketing/shared';
import { XenditClient } from './xendit.client';

const MIN_INVOICE_DURATION_S = 300;
const MAX_INVOICE_DURATION_S = 2 * 24 * 3600;

const INTERNAL_ORIGIN = 'https://internal.invalid';

/**
 * Xendit payment provider (Invoices API).
 *
 * Flow:
 *  - `createInvoiceForBooking` creates a hosted invoice / payment link and
 *    returns its URL. The user pays on Xendit's page.
 *  - Xendit POSTs an invoice callback to our webhook; `verifySignature` +
 *    `parseCallback` validate it before the booking is confirmed.
 *
 * Required env:
 *  - `XENDIT_SECRET_KEY` — secret API key (Basic auth username).
 *  - `XENDIT_WEBHOOK_TOKEN` — value of the `x-callback-token` header.
 *  - `XENDIT_API_URL` (default https://api.xendit.co).
 */
@Injectable()
export class PaymentService {
  /**
   * Post-payment browser redirect base. Only the path portion of a
   * caller-supplied return URL is honored (query string included) — the
   * origin always comes from server config — so the payment flow can never
   * be used to bounce users to an off-site URL (open redirect / phishing).
   */
  static sameOriginPath(raw: string): string {
    let candidate = raw.trim();
    try {
      const url = new URL(candidate, INTERNAL_ORIGIN);
      if (url.origin !== INTERNAL_ORIGIN) {
        candidate = url.pathname + url.search + url.hash;
      }
      if (!candidate.startsWith('/') || candidate.startsWith('//')) return '';
      return candidate;
    } catch {
      return '';
    }
  }
  constructor(private readonly xendit: XenditClient) {}

  /** Deterministic external reference so re-charge is idempotent. */
  externalIdFor(bookingId: string): string {
    return `cix-${bookingId}`;
  }

  invoiceDurationFor(expiresAt: Date): number {
    const remainingS = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return Math.min(
      MAX_INVOICE_DURATION_S,
      Math.max(MIN_INVOICE_DURATION_S, remainingS),
    );
  }

  /**
   * The app origin Xendit must redirect back to. `XENDIT_RETURN_URL` is the
   * public HTTPS entry point (e.g. a tunnel in local dev); the SPA origin
   * (`EMAIL_BASE_URL`) is the fallback.
   */
  private appOrigin(): string {
    return (XENDIT_RETURN_URL || EMAIL_BASE_URL).replace(/\/$/, '');
  }

  /**
   * Builds an absolute post-payment redirect for Xendit. Xendit treats a
   * path-only value as relative to its own checkout domain, which lands the
   * user on a 404 — so a sanitized caller path is always re-anchored to our
   * configured origin.
   */
  successRedirectUrl(bookingId: string, returnUrl?: string): string {
    const safe = returnUrl ? PaymentService.sameOriginPath(returnUrl) : '';
    const path = safe || `/bookings/confirm/${bookingId}`;
    return `${this.appOrigin()}${path}`;
  }

  failureRedirectUrl(bookingId: string): string {
    return `${this.appOrigin()}/bookings/checkout?bookingId=${bookingId}`;
  }

  async createInvoiceForBooking(args: {
    bookingId: string;
    amount: number;
    currency: string;
    description: string;
    expiresAt: Date;
    payerEmail?: string;
    returnUrl?: string;
  }): Promise<{ invoiceId: string; checkoutUrl: string; externalId: string }> {
    const externalId = this.externalIdFor(args.bookingId);
    const invoice = await this.xendit.createInvoice({
      externalId,
      amount: args.amount,
      currency: args.currency,
      description: args.description,
      payerEmail: args.payerEmail || undefined,
      successRedirectUrl: this.successRedirectUrl(
        args.bookingId,
        args.returnUrl,
      ),
      failureRedirectUrl: this.failureRedirectUrl(args.bookingId),
      invoiceDuration: this.invoiceDurationFor(args.expiresAt),
      metadata: { bookingId: args.bookingId },
    });
    return {
      invoiceId: invoice.id,
      checkoutUrl: invoice.invoice_url,
      externalId: invoice.external_id || externalId,
    };
  }

  async getInvoiceStatus(invoiceId: string): Promise<string> {
    const invoice = await this.xendit.getInvoice(invoiceId);
    return invoice.status;
  }

  async expireInvoice(invoiceId: string): Promise<void> {
    await this.xendit.expireInvoice(invoiceId);
  }

  verifySignature(signature: string): void {
    if (!XENDIT_WEBHOOK_TOKEN) {
      throw new RpcException(
        rpcErrorPayload(503, 'XENDIT_WEBHOOK_TOKEN is not configured'),
      );
    }
    const provided = Buffer.from(signature ?? '', 'utf8');
    const expected = Buffer.from(XENDIT_WEBHOOK_TOKEN, 'utf8');
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new RpcException(rpcErrorPayload(401, 'Invalid webhook signature'));
    }
  }

  parseCallback(rawBody: string): XenditInvoiceCallback {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new RpcException(rpcErrorPayload(400, 'Invalid webhook body'));
    }
    const id = typeof data.id === 'string' ? data.id : '';
    const externalId =
      typeof data.external_id === 'string' ? data.external_id : '';
    const status = typeof data.status === 'string' ? data.status : '';
    if (!id || !externalId || !status) {
      throw new RpcException(
        rpcErrorPayload(
          400,
          'Invalid webhook body: missing id/external_id/status',
        ),
      );
    }
    return {
      id,
      external_id: externalId,
      status: status as XenditInvoiceCallback['status'],
      paid_at: typeof data.paid_at === 'string' ? data.paid_at : null,
      payment_method:
        typeof data.payment_method === 'string' ? data.payment_method : null,
      payment_channel:
        typeof data.payment_channel === 'string' ? data.payment_channel : null,
      paid_amount:
        typeof data.paid_amount === 'number' ? data.paid_amount : null,
      amount: typeof data.amount === 'number' ? data.amount : null,
    };
  }
}
