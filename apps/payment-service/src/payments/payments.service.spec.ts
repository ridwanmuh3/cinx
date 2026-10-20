import { Repository } from 'typeorm';
import {
  BookingRefundRequestedData,
  PaymentChargeRequest,
  PaymentWebhookRequest,
} from '@ticketing/shared';
import { PaymentEventsPublisher } from '../events/payment-events.publisher';
import { Payment } from './payment.entity';
import { PaymentProvider } from './payment.provider';
import { PaymentsService } from './payments.service';

function makeRepo(payment: Partial<Payment> | null = null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(payment),
    find: jest.fn().mockResolvedValue(payment ? [payment] : []),
    create: jest.fn((data: Partial<Payment>) => ({
      ...data,
      id: 'p1',
      createdAt: new Date('2026-08-12T14:00:00.000Z'),
      updatedAt: new Date('2026-08-12T14:00:00.000Z'),
    })),
    save: jest.fn((row: Payment) => Promise.resolve(row)),
  };
  return repo as unknown as Repository<Payment> & {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
}

function makeProvider(): PaymentProvider & {
  createInvoice: jest.Mock;
  getInvoice: jest.Mock;
  createRefund: jest.Mock;
  getRefund: jest.Mock;
  expireInvoice: jest.Mock;
  verifyWebhook: jest.Mock;
  parseWebhook: jest.Mock;
} {
  return {
    createInvoice: jest.fn(),
    getInvoice: jest.fn(),
    createRefund: jest.fn(),
    getRefund: jest.fn(),
    expireInvoice: jest.fn(),
    verifyWebhook: jest.fn(),
    parseWebhook: jest.fn(),
  };
}

function makePublisher() {
  return {
    settled: jest.fn().mockResolvedValue(undefined),
    failed: jest.fn().mockResolvedValue(undefined),
    refundPending: jest.fn().mockResolvedValue(undefined),
    refunded: jest.fn().mockResolvedValue(undefined),
    refundFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as PaymentEventsPublisher & {
    settled: jest.Mock;
    failed: jest.Mock;
    refundPending: jest.Mock;
    refunded: jest.Mock;
    refundFailed: jest.Mock;
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    bookingId: 'b1',
    externalId: 'cix-b1',
    providerTxnId: null,
    amount: 100000,
    currency: 'IDR',
    status: 'PENDING',
    refundId: null,
    refundedAt: null,
    paidAt: null,
    receiptUrl: null,
    invoiceId: 'inv_1',
    checkoutUrl: 'https://checkout.xendit.co/inv_1',
    method: 'XENDIT',
    createdAt: new Date('2026-08-12T14:00:00.000Z'),
    updatedAt: new Date('2026-08-12T14:00:00.000Z'),
    ...overrides,
  };
}

describe('PaymentsService', () => {
  const charge: PaymentChargeRequest = {
    bookingId: 'b1',
    userId: 'u1',
    amount: 100000,
    currency: 'IDR',
    expiresAt: '2026-08-12T15:00:00.000Z',
    description: 'CinX: Movie @ Theater',
    returnUrl: '/bookings/confirm/b1',
    payerEmail: 'user@example.com',
  };

  it('charge creates a provider invoice and stores it', async () => {
    const repo = makeRepo();
    const provider = makeProvider();
    provider.createInvoice.mockResolvedValue({
      id: 'inv_1',
      external_id: 'cix-b1',
      amount: 100000,
      status: 'PENDING',
      invoice_url: 'https://checkout.xendit.co/inv_1',
    });
    const events = makePublisher();
    const service = new PaymentsService(repo, provider, events);

    const result = await service.charge(charge);

    expect(provider.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'cix-b1',
        amount: 100000,
        description: 'CinX: Movie @ Theater',
      }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(result.checkoutUrl).toBe('https://checkout.xendit.co/inv_1');
    expect(result.invoiceId).toBe('inv_1');
  });

  it('webhook verifies the token, marks PAID, and publishes payment.settled', async () => {
    const row = payment();
    const repo = makeRepo(row);
    const provider = makeProvider();
    provider.parseWebhook.mockReturnValue({
      id: 'inv_1',
      external_id: 'cix-b1',
      status: 'PAID',
      paid_at: '2026-08-12T14:10:00.000Z',
    });
    const events = makePublisher();
    const service = new PaymentsService(repo, provider, events);

    const body: PaymentWebhookRequest = {
      signature: 'token',
      body: '{"id":"inv_1"}',
    };
    await service.webhook(body);

    expect(provider.verifyWebhook).toHaveBeenCalledWith('token');
    expect(row.status).toBe('PAID');
    expect(row.paidAt?.toISOString()).toBe('2026-08-12T14:10:00.000Z');
    expect(events.settled).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b1',
        amount: 100000,
        method: 'XENDIT',
      }),
    );
  });

  it('requestRefund is idempotent for an already-refunded payment', async () => {
    const row = payment({ status: 'REFUNDED', refundedAt: new Date() });
    const repo = makeRepo(row);
    const provider = makeProvider();
    const events = makePublisher();
    const service = new PaymentsService(repo, provider, events);

    const data: BookingRefundRequestedData = {
      bookingId: 'b1',
      userId: 'u1',
      amount: 100000,
      currency: 'IDR',
      reason: 'CUSTOMER',
    };
    await service.requestRefund(data);

    expect(provider.createRefund).not.toHaveBeenCalled();
    expect(events.refunded).toHaveBeenCalled();
  });

  it('requestRefund starts a provider refund and records REFUND_PENDING', async () => {
    const row = payment({ status: 'PAID', paidAt: new Date() });
    const repo = makeRepo(row);
    const provider = makeProvider();
    provider.createRefund.mockResolvedValue({
      id: 'rfd_1',
      status: 'PENDING',
    });
    const events = makePublisher();
    const service = new PaymentsService(repo, provider, events);

    await service.requestRefund({
      bookingId: 'b1',
      userId: 'u1',
      amount: 100000,
      currency: 'IDR',
      reason: 'CUSTOMER',
    });

    expect(row.status).toBe('REFUND_PENDING');
    expect(row.refundId).toBe('rfd_1');
    expect(events.refundPending).toHaveBeenCalled();
  });
});
