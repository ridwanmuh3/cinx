import { Resend } from 'resend';
import { ResendService } from './resend.service';
import { BookingConfirmationData, PaymentReceiptData } from '@ticketing/shared';

function makeResend(dryRun = true): ResendService {
  const svc = new ResendService();
  // RESEND_API_KEY may be present in the ambient env; force the intended mode
  // so unit tests are deterministic regardless of the host environment.
  svc['resend'] = dryRun ? null : new Resend('re_test_key');
  return svc;
}

describe('ResendService', () => {
  it('dry-run logs and returns a fake messageId', async () => {
    const svc = makeResend(true);
    const res = await svc.sendBookingConfirmation({
      recipient: { to: 'user@example.com', name: 'Ada' },
      bookingId: 'b-1',
      totalAmount: 150000,
      currency: 'IDR',
      movieTitle: 'The Grand Adventure',
      theaterName: 'Grand Cineplex 1',
      startsAt: '2026-08-20T18:00:00.000Z',
      seats: [
        {
          seatId: 's1',
          rowLabel: 'A',
          seatNumber: 7,
          category: 'REGULAR',
          priceAmount: 50000,
        },
      ],
      tickets: [
        { code: 'TKT-000001', seatId: 's1', rowLabel: 'A', seatNumber: 7 },
      ],
      confirmedAt: '2026-08-14T10:00:00.000Z',
    } as BookingConfirmationData);
    expect(res.accepted).toBe(true);
    expect(res.messageId).toMatch(/dry-run/);
    expect(res.error).toBeNull();
  });

  it('payment receipt renders in dry-run', async () => {
    const svc = makeResend(true);
    const res = await svc.sendPaymentReceipt({
      recipient: { to: 'user@example.com', name: null },
      bookingId: 'b-1',
      amount: 150000,
      currency: 'IDR',
      providerId: 'x_1',
      providerTxnId: 'txn_1',
      paidAt: '2026-08-14T10:00:00.000Z',
      method: 'XENDIT',
      receiptUrl: 'https://xendit.co/receipt',
      movieTitle: 'M',
      theaterName: 'T',
      startsAt: '2026-08-20T18:00:00.000Z',
    } as PaymentReceiptData);
    expect(res.accepted).toBe(true);
  });
});
