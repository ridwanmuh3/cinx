import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  rpcErrorPayload,
  XENDIT_API_URL,
  XENDIT_SECRET_KEY,
} from '@ticketing/shared';

export interface CreateInvoiceInput {
  externalId: string;
  amount: number;
  currency: string;
  description: string;
  payerEmail?: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  invoiceDuration: number;
  metadata?: Record<string, string>;
}

export interface XenditInvoice {
  id: string;
  external_id: string;
  amount: number;
  status: string;
  invoice_url: string;
  expiry_date?: string;
}

export interface CreateRefundInput {
  invoiceId: string;
  amount: number;
  /** Xendit reason enum; CANCELLATION is the honest one for a user cancel. */
  reason?: string;
}

export interface XenditRefund {
  id: string;
  invoice_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status: string;
}

/**
 * Minimal HTTP client for the Xendit Invoices API (v2).
 * Auth: HTTP Basic with the secret key as username and an empty password.
 * See https://docs.xendit.co — POST /v2/invoices, GET /v2/invoices/{id}.
 */
@Injectable()
export class XenditClient {
  // No constructor params: Nest instantiates this as a provider. Config
  // comes from env-backed shared constants; tests stub the methods.
  private readonly apiUrl = XENDIT_API_URL.replace(/\/$/, '');
  private readonly secretKey = XENDIT_SECRET_KEY;

  private assertConfigured(): void {
    if (!this.secretKey) {
      throw new RpcException(
        rpcErrorPayload(503, 'XENDIT_SECRET_KEY is not configured'),
      );
    }
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  async createInvoice(input: CreateInvoiceInput): Promise<XenditInvoice> {
    this.assertConfigured();
    const res = await fetch(`${this.apiUrl}/v2/invoices`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: input.externalId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        payer_email: input.payerEmail ?? undefined,
        success_redirect_url: input.successRedirectUrl,
        failure_redirect_url: input.failureRedirectUrl,
        invoice_duration: input.invoiceDuration,
        metadata: input.metadata ?? undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new RpcException(
        rpcErrorPayload(
          502,
          `Xendit create invoice failed (${res.status}): ${detail}`,
        ),
      );
    }
    const data = (await res.json()) as XenditInvoice;
    if (!data?.id || !data?.invoice_url) {
      throw new RpcException(
        rpcErrorPayload(
          502,
          'Xendit create invoice returned an invalid payload',
        ),
      );
    }
    return data;
  }

  async getInvoice(invoiceId: string): Promise<XenditInvoice> {
    this.assertConfigured();
    const res = await fetch(
      `${this.apiUrl}/v2/invoices/${encodeURIComponent(invoiceId)}`,
      {
        method: 'GET',
        headers: { Authorization: this.authHeader() },
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new RpcException(
        rpcErrorPayload(
          502,
          `Xendit get invoice failed (${res.status}): ${detail}`,
        ),
      );
    }
    return (await res.json()) as XenditInvoice;
  }

  /**
   * Request a refund for a paid invoice. Xendit processes refunds
   * asynchronously, so the returned status is typically PENDING and must be
   * settled later via `getRefund` (see reconcileRefunds).
   */
  async createRefund(input: CreateRefundInput): Promise<XenditRefund> {
    this.assertConfigured();
    const res = await fetch(`${this.apiUrl}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_id: input.invoiceId,
        amount: input.amount,
        reason: input.reason ?? 'CANCELLATION',
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new RpcException(
        rpcErrorPayload(
          502,
          `Xendit create refund failed (${res.status}): ${detail}`,
        ),
      );
    }
    const data = (await res.json()) as XenditRefund;
    if (!data?.id || !data?.status) {
      throw new RpcException(
        rpcErrorPayload(
          502,
          'Xendit create refund returned an invalid payload',
        ),
      );
    }
    return data;
  }

  async getRefund(refundId: string): Promise<XenditRefund> {
    this.assertConfigured();
    const res = await fetch(
      `${this.apiUrl}/refunds/${encodeURIComponent(refundId)}`,
      {
        method: 'GET',
        headers: { Authorization: this.authHeader() },
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new RpcException(
        rpcErrorPayload(
          502,
          `Xendit get refund failed (${res.status}): ${detail}`,
        ),
      );
    }
    return (await res.json()) as XenditRefund;
  }

  /** Best-effort expiry; never throws — reconciliation must not fail on it. */
  async expireInvoice(invoiceId: string): Promise<void> {
    try {
      this.assertConfigured();
      await fetch(
        `${this.apiUrl}/invoices/${encodeURIComponent(invoiceId)}/expire!`,
        {
          method: 'POST',
          headers: { Authorization: this.authHeader() },
        },
      );
    } catch {
      /* best-effort */
    }
  }
}
