export const NotificationPatterns = {
  BOOKING_CONFIRMED: 'booking.confirmed',
  PAYMENT_RECEIVED: 'payment.received',
} as const;

export type EmailEvent = 'booking.confirmed' | 'payment.received';

/** Outcome of an email delivery attempt (Resend or dry-run). */
export interface EmailResult {
  accepted: boolean;
  messageId: string | null;
  error: string | null;
}

export interface Recipient {
  to: string;
  name: string | null;
}

export interface BookingConfirmationData {
  recipient: Recipient;
  bookingId: string;
  totalAmount: number;
  currency: 'IDR';
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seats: Array<{
    seatId: string;
    rowLabel: string;
    seatNumber: number;
    category: string;
    priceAmount: number;
  }>;
  tickets: Array<{
    code: string;
    seatId: string;
    rowLabel: string;
    seatNumber: number;
  }>;
  confirmedAt: string;
}

export interface PaymentReceiptData {
  recipient: Recipient;
  bookingId: string;
  amount: number;
  currency: 'IDR';
  providerId: string;
  providerTxnId: string | null;
  paidAt: string;
  method: string;
  receiptUrl: string | null;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
}
