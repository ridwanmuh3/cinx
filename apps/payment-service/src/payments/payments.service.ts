import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingRefundRequestedData,
  EMAIL_BASE_URL,
  externalIdForBooking,
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentDto,
  PaymentWebhookRequest,
  PaymentSyncRequest,
  rpcErrorPayload,
  XENDIT_RETURN_URL,
} from '@ticketing/shared';
import { PaymentEventsPublisher } from '../events/payment-events.publisher';
import { Payment } from './payment.entity';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment.provider';

const MIN_INVOICE_DURATION_S = 300;
const MAX_INVOICE_DURATION_S = 2 * 24 * 3600;
const INTERNAL_ORIGIN = 'https://internal.invalid';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly events: PaymentEventsPublisher,
  ) {}

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

  private appOrigin(): string {
    return (XENDIT_RETURN_URL || EMAIL_BASE_URL).replace(/\/$/, '');
  }

  successRedirectUrl(bookingId: string, returnUrl?: string): string {
    const safe = returnUrl ? PaymentsService.sameOriginPath(returnUrl) : '';
    const path = safe || `/bookings/confirm/${bookingId}`;
    return `${this.appOrigin()}${path}`;
  }

  failureRedirectUrl(bookingId: string): string {
    return `${this.appOrigin()}/bookings/checkout?bookingId=${bookingId}`;
  }

  invoiceDurationFor(expiresAt: Date): number {
    const remainingS = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return Math.min(
      MAX_INVOICE_DURATION_S,
      Math.max(MIN_INVOICE_DURATION_S, remainingS),
    );
  }

  /**
   * Create (or reuse) the hosted invoice for a booking. Booking-service never
   * calls this directly; the gateway composes PrepareCharge + Charge.
   */
  async charge(dto: PaymentChargeRequest): Promise<PaymentChargeResponse> {
    if (!dto.bookingId) {
      throw new RpcException(rpcErrorPayload(400, 'bookingId is required'));
    }
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new RpcException(rpcErrorPayload(400, 'amount must be positive'));
    }
    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new RpcException(rpcErrorPayload(400, 'expiresAt is invalid'));
    }

    let payment = await this.payments.findOne({
      where: { bookingId: dto.bookingId },
    });

    if (payment?.status === 'PAID') {
      return this.toChargeResponse(payment);
    }
    if (
      payment?.status === 'REFUND_PENDING' ||
      payment?.status === 'REFUNDED'
    ) {
      throw new RpcException(
        rpcErrorPayload(409, 'Payment is already being refunded'),
      );
    }

    // Reuse a live invoice when one already exists for this booking.
    if (payment?.invoiceId && payment.checkoutUrl) {
      try {
        const status = await this.provider.getInvoice(payment.invoiceId);
        if (status.status === 'PENDING') {
          return this.toChargeResponse(payment);
        }
      } catch {
        // Fall through and create a fresh invoice.
      }
    }

    const created = await this.provider.createInvoice({
      externalId: externalIdForBooking(dto.bookingId),
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description || `CinX booking ${dto.bookingId}`,
      payerEmail: dto.payerEmail || undefined,
      successRedirectUrl: this.successRedirectUrl(dto.bookingId, dto.returnUrl),
      failureRedirectUrl: this.failureRedirectUrl(dto.bookingId),
      invoiceDuration: this.invoiceDurationFor(expiresAt),
      metadata: { bookingId: dto.bookingId },
    });

    if (!payment) {
      payment = this.payments.create({
        bookingId: dto.bookingId,
        externalId: externalIdForBooking(dto.bookingId),
        amount: dto.amount,
        currency: dto.currency,
        status: 'PENDING',
        method: 'XENDIT',
      });
    }
    payment.externalId = created.external_id || payment.externalId;
    payment.invoiceId = created.id;
    payment.checkoutUrl = created.invoice_url;
    payment.amount = dto.amount;
    payment.currency = dto.currency;
    payment.status = 'PENDING';
    payment.paidAt = null;
    payment.providerTxnId = null;
    payment.receiptUrl = null;
    payment.refundId = null;
    payment.refundedAt = null;
    await this.payments.save(payment);

    return this.toChargeResponse(payment);
  }

  /**
   * Xendit invoice callback. The gateway forwards the verified
   * `x-callback-token` and raw body here; this service owns the provider
   * protocol and publishes the state change for booking-service.
   */
  async webhook(dto: PaymentWebhookRequest): Promise<Record<string, never>> {
    const signature =
      dto.signature ??
      dto.callbackToken ??
      dto.callback_token ??
      dto.xCallbackToken ??
      '';
    const rawBody = dto.body ?? dto.rawBody ?? dto.payload ?? '';
    this.provider.verifyWebhook(signature);
    const cb = this.provider.parseWebhook(rawBody);
    const status = cb.status.toUpperCase();

    const payment =
      (await this.payments.findOne({ where: { invoiceId: cb.id } })) ??
      (await this.payments.findOne({
        where: { externalId: cb.external_id },
      }));
    if (!payment) {
      throw new RpcException(rpcErrorPayload(404, 'Payment not found'));
    }

    if (status === 'PAID' || status === 'SETTLED' || status === 'CAPTURED') {
      await this.applyPaid(payment, cb.paid_at ?? null);
      return {};
    }

    if (status === 'EXPIRED' || status === 'FAILED' || status === 'CANCELLED') {
      await this.applyFailed(payment);
      return {};
    }

    return {};
  }

  /**
   * Server-side anti-entropy: ask the provider directly when a webhook was
   * lost or when no callback URL is registered. The resulting event updates
   * booking-service asynchronously; the gateway returns booking's projection.
   */
  async syncPaymentStatus(dto: PaymentSyncRequest): Promise<PaymentDto> {
    const payment = await this.findByBooking(dto.bookingId);
    if (payment.status !== 'PENDING') {
      return this.toDto(payment);
    }
    if (!payment.invoiceId) {
      throw new RpcException(
        rpcErrorPayload(409, 'No payment invoice exists for this booking'),
      );
    }

    let invoiceStatus: string;
    try {
      const invoice = await this.provider.getInvoice(payment.invoiceId);
      invoiceStatus = invoice.status.toUpperCase();
    } catch (err) {
      if (err instanceof RpcException) throw err;
      throw new RpcException(
        rpcErrorPayload(
          502,
          'Payment provider is unavailable, try again later',
        ),
      );
    }

    if (
      invoiceStatus === 'PAID' ||
      invoiceStatus === 'SETTLED' ||
      invoiceStatus === 'CAPTURED'
    ) {
      await this.applyPaid(payment, null);
    } else if (
      invoiceStatus === 'EXPIRED' ||
      invoiceStatus === 'FAILED' ||
      invoiceStatus === 'CANCELLED'
    ) {
      await this.applyFailed(payment);
    }

    return this.toDto(payment);
  }

  async get(bookingId: string): Promise<PaymentDto> {
    return this.toDto(await this.findByBooking(bookingId));
  }

  /** Start the provider refund for a paid booking. Idempotent. */
  async requestRefund(data: BookingRefundRequestedData): Promise<void> {
    let payment: Payment;
    try {
      payment = await this.findByBooking(data.bookingId);
    } catch {
      await this.events.refundFailed({
        paymentId: '',
        bookingId: data.bookingId,
        refundId: null,
      });
      return;
    }

    if (payment.status === 'REFUNDED') {
      await this.publishRefunded(payment);
      return;
    }
    if (payment.status === 'REFUND_PENDING') {
      await this.publishRefundPending(payment);
      return;
    }
    if (payment.status !== 'PAID' || !payment.invoiceId) {
      await this.events.refundFailed({
        paymentId: payment.id,
        bookingId: payment.bookingId,
        refundId: payment.refundId,
      });
      return;
    }

    try {
      const refund = await this.provider.createRefund({
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        reason: 'CANCELLATION',
      });
      payment.refundId = refund.id;
      if (refund.status.toUpperCase() === 'SUCCEEDED') {
        payment.status = 'REFUNDED';
        payment.refundedAt = new Date();
        await this.payments.save(payment);
        await this.publishRefunded(payment);
      } else {
        payment.status = 'REFUND_PENDING';
        await this.payments.save(payment);
        await this.publishRefundPending(payment);
      }
    } catch (err) {
      // The provider could not even start the refund: no money moved, so
      // booking may safely return to its paid state.
      this.logger.warn(
        `refund request failed for booking ${data.bookingId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.events.refundFailed({
        paymentId: payment.id,
        bookingId: payment.bookingId,
        refundId: payment.refundId,
      });
    }
  }

  /** Best-effort invoice expiry for a booking that ended unpaid. */
  async expireInvoice(bookingId: string): Promise<void> {
    try {
      const payment = await this.payments.findOne({ where: { bookingId } });
      if (!payment?.invoiceId || payment.status !== 'PENDING') return;
      await this.provider.expireInvoice(payment.invoiceId);
      payment.status = 'FAILED';
      await this.payments.save(payment);
    } catch {
      /* best-effort: a missed expiry is not a booking invariant */
    }
  }

  /** Finish in-flight refunds; Xendit settles refunds asynchronously. */
  @Cron('*/1 * * * *')
  async reconcileRefunds(): Promise<{
    finalized: string[];
    reverted: string[];
  }> {
    const pending = await this.payments.find({
      where: { status: 'REFUND_PENDING' },
    });
    const finalized: string[] = [];
    const reverted: string[] = [];

    for (const payment of pending) {
      if (!payment.refundId) continue;
      let status: string;
      try {
        status = (
          await this.provider.getRefund(payment.refundId)
        ).status.toUpperCase();
      } catch {
        // Provider unreachable: leave it in flight for the next pass.
        continue;
      }

      if (status === 'SUCCEEDED') {
        payment.status = 'REFUNDED';
        payment.refundedAt = new Date();
        await this.payments.save(payment);
        await this.publishRefunded(payment);
        finalized.push(payment.bookingId);
      } else if (status === 'FAILED') {
        payment.status = 'PAID';
        payment.refundId = null;
        await this.payments.save(payment);
        await this.events.refundFailed({
          paymentId: payment.id,
          bookingId: payment.bookingId,
          refundId: null,
        });
        reverted.push(payment.bookingId);
      }
    }

    return { finalized, reverted };
  }

  private async applyPaid(
    payment: Payment,
    paidAt: string | null,
  ): Promise<void> {
    if (payment.status === 'PAID') {
      await this.publishSettled(payment);
      return;
    }
    payment.status = 'PAID';
    payment.paidAt = paidAt ? new Date(paidAt) : new Date();
    // The Invoices API carries no separate settlement id, so providerTxnId
    // stays null rather than duplicating invoiceId.
    payment.providerTxnId = null;
    payment.receiptUrl = null;
    await this.payments.save(payment);
    await this.publishSettled(payment);
  }

  private async applyFailed(payment: Payment): Promise<void> {
    if (payment.status !== 'PENDING') {
      await this.events.failed({
        paymentId: payment.id,
        bookingId: payment.bookingId,
        status: payment.status,
        invoiceId: payment.invoiceId,
      });
      return;
    }
    payment.status = 'FAILED';
    await this.payments.save(payment);
    await this.events.failed({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      status: payment.status,
      invoiceId: payment.invoiceId,
    });
  }

  private async publishSettled(payment: Payment): Promise<void> {
    await this.events.settled({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amount: payment.amount,
      currency: payment.currency,
      externalId: payment.externalId,
      providerTxnId: payment.providerTxnId,
      paidAt: (payment.paidAt ?? new Date()).toISOString(),
      receiptUrl: payment.receiptUrl,
      method: payment.method,
      invoiceId: payment.invoiceId,
    });
  }

  private async publishRefundPending(payment: Payment): Promise<void> {
    await this.events.refundPending({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      refundId: payment.refundId,
    });
  }

  private async publishRefunded(payment: Payment): Promise<void> {
    await this.events.refunded({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      refundId: payment.refundId ?? '',
      refundedAt: (payment.refundedAt ?? new Date()).toISOString(),
    });
  }

  private async findByBooking(bookingId: string): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { bookingId } });
    if (!payment) {
      throw new RpcException(rpcErrorPayload(404, 'Payment not found'));
    }
    return payment;
  }

  private toChargeResponse(payment: Payment): PaymentChargeResponse {
    return {
      externalId: payment.externalId,
      paid: payment.status === 'PAID',
      providerTxnId: payment.providerTxnId,
      paidAt: payment.paidAt?.toISOString() ?? null,
      receiptUrl: payment.receiptUrl,
      checkoutUrl: payment.checkoutUrl,
      invoiceId: payment.invoiceId,
      method: payment.method,
    };
  }

  private toDto(payment: Payment): PaymentDto {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      externalId: payment.externalId,
      providerTxnId: payment.providerTxnId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      refundId: payment.refundId,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      receiptUrl: payment.receiptUrl,
      invoiceId: payment.invoiceId,
      checkoutUrl: payment.checkoutUrl,
      method: payment.method,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }
}
