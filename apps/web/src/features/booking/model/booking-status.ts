import type { BookingStatus } from '@/shared/api/types';

const LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending payment',
  CONFIRMED: 'Confirmed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
};

export function statusLabel(status: string): string {
  return LABELS[status as BookingStatus] ?? status;
}

export function statusChipClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'bx-chip--amber';
    case 'CONFIRMED':
      return 'bx-chip--green';
    case 'EXPIRED':
      return 'bx-chip--red';
    // REFUND_PENDING is amber because it is still in flight; CANCELLED and
    // REFUNDED are terminal and use the plain (muted) chip.
    case 'REFUND_PENDING':
      return 'bx-chip--amber';
    default:
      return '';
  }
}
