import type { PaymentMethod, PaymentStatus } from './payment';

export const BookingRpcPatterns = {
  PING: 'Ping',
  HOLD: 'Hold',
  CANCEL: 'Cancel',
  GET: 'Get',
  LIST: 'List',
  AVAILABILITY: 'Availability',
  PREPARE_CHARGE: 'PrepareCharge',
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

export interface PaginatedBookings {
  items: BookingDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HeldSeat {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: string;
  priceAmount: number;
  priceCurrency: 'IDR';
}

export interface PaymentSummary {
  externalId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  checkoutUrl: string | null;
  invoiceId: string | null;
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

/**
 * Read-only validation result returned by booking-service so the gateway can
 * start a payment without booking-service calling payment-service.
 */
export interface ChargeContext {
  bookingId: string;
  userId: string;
  amount: number;
  currency: 'IDR';
  expiresAt: string;
  description: string;
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
