export const NotificationPatterns = {
  TICKETS_ISSUED: 'tickets.issued',
  PAYMENT_RECEIVED: 'payment.received',
} as const;

export type EmailEvent = 'tickets.issued' | 'payment.received';

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
