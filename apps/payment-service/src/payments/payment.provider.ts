import type { XenditInvoiceCallback, XenditRefund } from '@ticketing/shared';

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

export interface ProviderInvoice {
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

/**
 * Port for payment providers. Xendit is the only adapter today; the domain
 * service depends on this interface so another provider can be added without
 * touching booking or payment state transitions.
 */
export interface PaymentProvider {
  createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice>;
  getInvoice(invoiceId: string): Promise<ProviderInvoice>;
  createRefund(input: CreateRefundInput): Promise<XenditRefund>;
  getRefund(refundId: string): Promise<XenditRefund>;
  expireInvoice(invoiceId: string): Promise<void>;
  verifyWebhook(signature: string): void;
  parseWebhook(rawBody: string): XenditInvoiceCallback;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
