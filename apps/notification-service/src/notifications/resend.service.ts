import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import {
  BookingConfirmationData,
  PaymentReceiptData,
  RESEND_API_KEY,
  RESEND_FROM,
  EMAIL_BASE_URL,
  withSpan,
} from '@ticketing/shared';

type EmailResult = {
  accepted: boolean;
  messageId: string | null;
  error: string | null;
};

/**
 * Escape user-controlled text before interpolating into HTML email
 * templates. Movie titles, theater names, user names, etc. can contain
 * `<`, `&`, quotes — unescaped interpolation enables HTML injection into
 * emails (brand-impersonation phishing, link spoofing).
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allow only http(s) links into `href` attributes. */
function safeUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? escapeHtml(url.toString())
      : '';
  } catch {
    return '';
  }
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend | null;
  private readonly from: string;

  constructor() {
    this.from = RESEND_FROM;
    this.resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not set; emails will be logged (dry-run mode).',
      );
    }
  }

  async sendBookingConfirmation(
    data: BookingConfirmationData,
  ): Promise<EmailResult> {
    const html = confirmationHtml(data);
    return this.deliver(data.recipient.to, data.recipient.name, html, {
      subject: `Your CinX tickets for ${data.movieTitle}`,
      tag: 'tickets',
    });
  }

  async sendPaymentReceipt(data: PaymentReceiptData): Promise<EmailResult> {
    const html = receiptHtml(data);
    return this.deliver(data.recipient.to, data.recipient.name, html, {
      subject: `Payment receipt — CinX (${data.providerTxnId ?? data.bookingId})`,
      tag: 'receipt',
    });
  }

  private async deliver(
    to: string,
    name: string | null,
    html: string,
    opts: { subject: string; tag: string },
  ): Promise<EmailResult> {
    return withSpan(
      'notification.send',
      async (span) => {
        span.setAttribute('notification.channel', 'email');
        span.setAttribute('notification.tag', opts.tag);
        const result = await this.deliverInner(to, name, html, opts);
        span.setAttribute('notification.accepted', result.accepted);
        return result;
      },
      { 'notification.channel': 'email', 'notification.tag': opts.tag },
    );
  }

  private async deliverInner(
    to: string,
    name: string | null,
    html: string,
    opts: { subject: string; tag: string },
  ): Promise<EmailResult> {
    if (!this.resend) {
      this.logger.log(
        `[dry-run] to=${to} name=${name ?? '-'} subject=${opts.subject}\n${html}`,
      );
      return {
        accepted: true,
        messageId: `dry-run-${Date.now()}`,
        error: null,
      };
    }
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: opts.subject,
        html,
      });
      if (error) {
        this.logger.error(
          `Resend error (${opts.tag}): ${JSON.stringify(error)}`,
        );
        return {
          accepted: false,
          messageId: null,
          error: error.message ?? 'send failed',
        };
      }
      return {
        accepted: true,
        messageId: data?.id ?? null,
        error: null,
      };
    } catch (err: any) {
      this.logger.error(`Resend throw (${opts.tag}): ${err?.message ?? err}`);
      return {
        accepted: false,
        messageId: null,
        error: err?.message ?? 'send failed',
      };
    }
  }
}

function confirmationHtml(d: BookingConfirmationData): string {
  const seats = d.seats
    .map(
      (s) =>
        `<li>${escapeHtml(`${s.rowLabel}${s.seatNumber}`)} — ${escapeHtml(s.category)} (Rp ${Number(s.priceAmount).toLocaleString('id-ID')})</li>`,
    )
    .join('');
  const tickets = d.tickets
    .map(
      (t) =>
        `<li><strong>${escapeHtml(t.code)}</strong> — ${escapeHtml(d.movieTitle)}, seat ${escapeHtml(`${t.rowLabel}${t.seatNumber}`)}</li>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>CinX tickets</title></head><body style="font-family:system-ui,Arial,sans-serif;color:#111827">
  <header style="background:#1f2937;padding:20px;color:#fff"><strong>CinX</strong> — Cinema tickets</header>
  <main style="padding:24px">
    <h1 style="color:#f59e0b">Booking confirmed</h1>
    <p>Hi${d.recipient.name ? ' ' + escapeHtml(d.recipient.name) : ''}, your payment was received and your booking <strong>${escapeHtml(d.bookingId)}</strong> is confirmed.</p>
    <p><strong>${escapeHtml(d.movieTitle)}</strong> at ${escapeHtml(d.theaterName)} starting <strong>${escapeHtml(new Date(d.startsAt).toLocaleString('id-ID'))}</strong></p>
    <h2 style="font-size:16px">Seats</h2>
    <ul>${seats}</ul>
    <p>Total paid: <strong>Rp ${Number(d.totalAmount).toLocaleString('id-ID')}</strong></p>
    <h2 style="font-size:16px">Your tickets</h2>
    <ul>${tickets}</ul>
    <p>Save this email or screenshot your tickets to scan at the door.</p>
    <p style="margin-top:16px"><a href="${safeUrl(`${EMAIL_BASE_URL}/bookings/confirm`)}" style="background:#f59e0b;color:#111827;padding:10px 16px;text-decoration:none;border-radius:6px">View your bookings</a></p>
  </main>
  <footer style="padding:16px;color:#6b7280;font-size:12px">CinX — ticketing@local</footer>
  </body></html>`;
}

function receiptHtml(d: PaymentReceiptData): string {
  const receiptLink = safeUrl(d.receiptUrl);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payment receipt</title></head><body style="font-family:system-ui,Arial,sans-serif;color:#111827">
  <header style="background:#1f2937;padding:20px;color:#fff"><strong>CinX</strong> — Payment receipt</header>
  <main style="padding:24px">
    <h1 style="color:#f59e0b">Payment received</h1>
    <p>Hi${d.recipient.name ? ' ' + escapeHtml(d.recipient.name) : ''}, we received your payment for booking <strong>${escapeHtml(d.bookingId)}</strong>.</p>
    <ul>
      <li>Paid: <strong>Rp ${Number(d.amount).toLocaleString('id-ID')}</strong> ${escapeHtml(d.currency)}</li>
      <li>Method: ${escapeHtml(d.method)}</li>
      <li>Transaction: ${escapeHtml(d.providerTxnId ?? d.providerId)}</li>
      <li>Paid at: ${escapeHtml(new Date(d.paidAt).toLocaleString('id-ID'))}</li>
    </ul>
    <p>${escapeHtml(d.movieTitle)} — ${escapeHtml(d.theaterName)} (${escapeHtml(new Date(d.startsAt).toLocaleString('id-ID'))})</p>
    ${receiptLink ? `<p>Receipt: <a href="${receiptLink}">${receiptLink}</a></p>` : ''}
  </main>
  <footer style="padding:16px;color:#6b7280;font-size:12px">CinX — ticketing@local</footer>
  </body></html>`;
}
