import type { BookingSeatSnapshot, CancellationReason } from './booking';
import type { Recipient } from './notification';
import type { PaymentMethod, PaymentStatus } from './payment';

export const PaymentEvents = {
  SETTLED: 'payment.settled',
  FAILED: 'payment.failed',
  REFUND_PENDING: 'payment.refund_pending',
  REFUNDED: 'payment.refunded',
  REFUND_FAILED: 'payment.refund_failed',
  RECEIVED: 'payment.received',
} as const;

export const BookingEvents = {
  CONFIRMED: 'booking.confirmed',
  CANCELLED: 'booking.cancelled',
  EXPIRED: 'booking.expired',
  REFUND_REQUESTED: 'booking.refund.requested',
  REFUNDED: 'booking.refunded',
} as const;

export const TicketEvents = {
  ISSUED: 'tickets.issued',
  VOIDED: 'tickets.voided',
} as const;

export interface PaymentSettledData {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: 'IDR';
  externalId: string;
  providerTxnId: string | null;
  paidAt: string;
  receiptUrl: string | null;
  method: PaymentMethod;
  invoiceId: string | null;
}

export interface PaymentFailedData {
  paymentId: string;
  bookingId: string;
  status: PaymentStatus;
  invoiceId: string | null;
}

export interface PaymentRefundPendingData {
  paymentId: string;
  bookingId: string;
  refundId: string | null;
}

export interface PaymentRefundedData {
  paymentId: string;
  bookingId: string;
  refundId: string;
  refundedAt: string;
}

export interface PaymentRefundFailedData {
  paymentId: string;
  bookingId: string;
  refundId: string | null;
}

export interface BookingConfirmedData {
  recipient: Recipient | null;
  bookingId: string;
  userId: string;
  showtimeId: string;
  totalAmount: number;
  currency: 'IDR';
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seats: BookingSeatSnapshot[];
  confirmedAt: string;
}

export interface BookingCancelledData {
  bookingId: string;
  userId: string;
  reason: CancellationReason;
}

export interface BookingExpiredData {
  bookingId: string;
  userId: string;
}

export interface BookingRefundRequestedData {
  bookingId: string;
  userId: string;
  amount: number;
  currency: 'IDR';
  reason: string;
}

export interface BookingRefundedData {
  bookingId: string;
  userId: string;
}

export interface TicketIssuedItem {
  code: string;
  seatId: string;
  rowLabel: string;
  seatNumber: number;
}

export interface TicketsIssuedData {
  recipient: Recipient | null;
  bookingId: string;
  userId: string;
  showtimeId: string;
  totalAmount: number;
  currency: 'IDR';
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seats: BookingSeatSnapshot[];
  tickets: TicketIssuedItem[];
  confirmedAt: string;
}

export interface TicketsVoidedData {
  bookingId: string;
}

export interface PaymentReceivedData {
  recipient: Recipient | null;
  bookingId: string;
  amount: number;
  currency: 'IDR';
  externalId: string;
  providerTxnId: string | null;
  paidAt: string;
  method: PaymentMethod;
  receiptUrl: string | null;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
}
