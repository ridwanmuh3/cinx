import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { timingSafeEqual } from 'node:crypto';
import {
  rpcErrorPayload,
  XENDIT_API_URL,
  XENDIT_SECRET_KEY,
  XENDIT_WEBHOOK_TOKEN,
  XenditInvoiceCallback,
  XenditRefund,
} from '@ticketing/shared';
import {
  CreateInvoiceInput,
  CreateRefundInput,
  PaymentProvider,
  ProviderInvoice,
} from './payment.provider';

/**
 * Xendit adapter (Invoices + Refunds API).
 *
 * Auth: HTTP Basic with the secret key as username and an empty password.
 * See https://docs.xendit.co — POST /v2/invoices, GET /v2/invoices/{id}.
 */
@Injectable()
export class XenditProvider implements PaymentProvider {
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

  async createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice> {
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
    const data = (await res.json()) as ProviderInvoice;
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

  async getInvoice(invoiceId: string): Promise<ProviderInvoice> {
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
    return (await res.json()) as ProviderInvoice;
  }

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

  verifyWebhook(signature: string): void {
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

  parseWebhook(rawBody: string): XenditInvoiceCallback {
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
