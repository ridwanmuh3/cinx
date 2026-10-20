export const PaymentRpcPatterns = {
  PING: 'Ping',
  CHARGE: 'Charge',
  WEBHOOK: 'Webhook',
  SYNC: 'SyncPaymentStatus',
  GET: 'Get',
} as const;

export type PaymentStatus =
  'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';

export type PaymentMethod = 'XENDIT';

export type XenditRefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export type XenditInvoiceStatus =
  'PENDING' | 'PAID' | 'SETTLED' | 'EXPIRED' | 'FAILED';

/** Response shape of Xendit's Refunds API (POST/GET /refunds). */
export interface XenditRefund {
  id: string;
  invoice_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status: string;
}

export interface PaymentChargeRequest {
  bookingId: string;
  userId: string;
  amount: number;
  currency: 'IDR';
  expiresAt: string;
  description: string;
  returnUrl?: string;
  payerEmail?: string;
}

export interface PaymentChargeResponse {
  /** Our reference for the booking, as handed to the provider. */
  externalId: string;
  paid: boolean;
  providerTxnId: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
  checkoutUrl: string | null;
  invoiceId: string | null;
  method: PaymentMethod;
}

export interface PaymentWebhookRequest {
  /** Value of the `x-callback-token` header sent by Xendit.
   * @deprecated Legacy alias — the gateway may still send `signature`. */
  signature: string;
  /** Raw JSON webhook body sent by Xendit (stringified).
   * @deprecated Legacy alias — the gateway may still send `body`. */
  body?: string;
  /** Alternative field names accepted by the gateway. */
  callbackToken?: string;
  callback_token?: string;
  xCallbackToken?: string;
  rawBody?: string;
  payload?: string;
}

/** Server-side payment status sync request (no webhook required). */
export interface PaymentSyncRequest {
  bookingId: string;
}

export interface PaymentGetRequest {
  bookingId: string;
}

export interface XenditInvoiceCallback {
  id: string;
  external_id: string;
  status: XenditInvoiceStatus;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_channel?: string | null;
  paid_amount?: number | null;
  amount?: number | null;
}

export interface PaymentDto {
  id: string;
  bookingId: string;
  externalId: string;
  providerTxnId: string | null;
  amount: number;
  currency: 'IDR';
  status: PaymentStatus;
  refundId: string | null;
  refundedAt: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
  invoiceId: string | null;
  checkoutUrl: string | null;
  method: PaymentMethod;
  createdAt: string;
  updatedAt: string;
}

/** Deterministic reference handed to the provider so a re-charge is idempotent. */
export function externalIdForBooking(bookingId: string): string {
  return `cix-${bookingId}`;
}
