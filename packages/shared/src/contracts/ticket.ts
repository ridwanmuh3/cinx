export const TicketPatterns = {
  // bookings
  BOOKING_HOLD: 'booking.hold',
  BOOKING_CANCEL: 'booking.cancel',
  BOOKING_GET: 'booking.get',
  BOOKING_LIST: 'booking.list',
  BOOKING_AVAILABILITY: 'booking.availability',
  // payments
  PAYMENT_CHARGE: 'payment.charge',
  PAYMENT_CONFIRM: 'payment.confirm',
  // tickets
  TICKET_CREATE: 'ticket.create',
  TICKET_GET_BY_CODE: 'ticket.getByCode',
} as const;

import { PaginationMeta, SeatCategory } from './cinema';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export type PaymentMethod = 'MOCK';

export type MockSimulation = 'SUCCESS' | 'FAILURE';

// Seat hold: ticket-service validates seats against cinema-service, then locks.
export interface HoldSeatsRequest {
  userId: string;
  showtimeId: string;
  seatIds: string[]; // logical refs to cinema_db.seats
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

export interface PaymentChargeRequest {
  /** Mock provider outcome override (defaults to SUCCESS). */
  simulate?: MockSimulation;
}

export interface PaymentChargeResponse {
  providerId: string;
  paid: boolean;
  providerTxnId: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
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

export interface TicketByCodeRequest {
  code: string;
}

/** Public ticket lookup (scanning) — extends TicketDto with seat + showtime info. */
export interface TicketLookupDto {
  id: string;
  code: string;
  bookingId: string;
  showtimeId: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  row: string;
  number: number;
}

export interface HeldSeat {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: SeatCategory;
  priceAmount: number; // snapshot of showtime price
  priceCurrency: 'IDR';
}

export interface HoldResponse {
  bookingId: string;
  status: BookingStatus; // PENDING
  expiresAt: string; // ISO timestamptz
  totalAmount: number;
  currency: 'IDR';
  seats: HeldSeat[];
  payment: {
    providerId: string;
    method: PaymentMethod;
    status: PaymentStatus; // PENDING
  };
}

// Payment confirm after mock provider returns (gateway forwards result).
export interface PaymentConfirmRequest {
  bookingId: string;
  userId: string;
  // mock provider result
  paid: boolean;
  providerId: string;
  paidAt?: string | null;
  receipt?: string | null;
}

export interface BookingSeatSnapshot {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: SeatCategory;
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
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  seats: BookingSeatSnapshot[];
}

export interface TicketDto {
  id: string;
  bookingId: string;
  code: string; // TKT-XXXXXX
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  createdAt: string;
}

export interface PaginatedBookings {
  items: BookingDto[];
  meta: PaginationMeta;
}
