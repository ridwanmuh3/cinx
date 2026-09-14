import type { BookingStatus } from '@/shared/api/types';

const LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending payment',
  CONFIRMED: 'Confirmed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
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
    default:
      return '';
  }
}
