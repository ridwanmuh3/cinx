import { PaginationMeta } from './cinema';

export const TicketPatterns = {
  PING: 'Ping',
  BOOKING_HOLD: 'Hold',
  BOOKING_CANCEL: 'Cancel',
  BOOKING_GET: 'Get',
  BOOKING_LIST: 'List',
  BOOKING_AVAILABILITY: 'Availability',
  PAYMENT_CHARGE: 'Charge',
  PAYMENT_WEBHOOK: 'Webhook',
  PAYMENT_SYNC: 'SyncPaymentStatus',
  TICKET_ISSUE: 'IssueTickets',
  TICKET_LIST: 'ListTickets',
  TICKET_GET_BY_CODE: 'GetTicketByCode',
} as const;

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'CANCELLED'
  /** A refund was requested from the provider but has not settled yet. */
  | 'REFUND_PENDING'
  /** The provider returned the money; the booking is terminal. */
  | 'REFUNDED';

/** Why a Booking ended up CANCELLED. `EXPIRED` holds are not cancellations. */
export type CancellationReason = 'CUSTOMER' | 'PAYMENT_DECLINED';

export type PaymentStatus =
  'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';

export type XenditRefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

/** Response shape of Xendit's Refunds API (POST/GET /refunds). */
export interface XenditRefund {
  id: string;
  invoice_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status: string;
}

export type PaymentMethod = 'XENDIT';

export type XenditInvoiceStatus =
  'PENDING' | 'PAID' | 'SETTLED' | 'EXPIRED' | 'FAILED';

export interface HoldSeatsRequest {
  userId: string;
  showtimeId: string;
  seatIds: string[];
}

export interface BookingGetRequest {
  id: string;
  userId: string;
}

export interface BookingCancelRequest {
  id: string;
  userId: string;
}

export interface BookingListRequest {
  userId: string;
  page?: number;
  limit?: number;
}

export interface ReconcileResult {
  expired: string[];
  count: number;
}

export interface PaymentChargeRequest {
  bookingId: string;
  userId: string;
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
  userId: string;
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

export interface TicketByCodeRequest {
  code: string;
}

export interface TicketLookupDto {
  id: string;
  code: string;
  bookingId: string;
  showtimeId: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  row: string;
  number: number;
}

export interface HeldSeat {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: string;
  priceAmount: number;
  priceCurrency: 'IDR';
}

export interface HoldResponse {
  bookingId: string;
  status: BookingStatus;
  expiresAt: string;
  totalAmount: number;
  currency: 'IDR';
  seats: HeldSeat[];
  payment: PaymentSummary;
}

export interface PaymentSummary {
  externalId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  checkoutUrl: string | null;
  invoiceId: string | null;
}

export interface BookingSeatSnapshot {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: string;
  priceAmount: number;
  priceCurrency: 'IDR';
}

export interface BookingDto {
  id: string;
  userId: string;
  showtimeId: string;
  totalAmount: number;
  currency: 'IDR';
  status: BookingStatus;
  /** Set only when `status` is `CANCELLED`; null otherwise. */
  cancellationReason: CancellationReason | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  seats: BookingSeatSnapshot[];
}

export interface TicketDto {
  id: string;
  bookingId: string;
  code: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  row: string;
  number: number;
  createdAt: string;
}

export interface PaginatedBookings {
  items: BookingDto[];
  meta: PaginationMeta;
}

export interface TicketList {
  items: TicketDto[];
}

export interface BookingAvailabilityRequest {
  showtimeId: string;
}

export type SeatAvailabilityStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface SeatAvailability {
  seatId: string;
  status: SeatAvailabilityStatus;
}

export interface BookingAvailabilityResponse {
  showtimeId: string;
  seats: SeatAvailability[];
}
