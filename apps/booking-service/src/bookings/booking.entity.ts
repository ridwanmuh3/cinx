import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BookingStatus, CancellationReason } from '@ticketing/shared';
import { BookingSeat } from './booking-seat.entity';

@Entity('bookings')
@Index(['status'])
@Index(['userId'])
@Index(['paidAt'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'showtime_id', type: 'uuid' })
  showtimeId: string;

  /** Snapshot from cinema-service at hold time. */
  @Column({ name: 'movie_title', type: 'varchar', length: 200 })
  movieTitle: string;

  @Column({ name: 'theater_name', type: 'varchar', length: 200 })
  theaterName: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'total_amount', type: 'int' })
  totalAmount: number;

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: 'IDR',
  })
  currency: string;

  @Column({
    type: 'enum',
    enum: [
      'PENDING',
      'CONFIRMED',
      'EXPIRED',
      'CANCELLED',
      'REFUND_PENDING',
      'REFUNDED',
    ],
    default: 'PENDING',
  })
  status: BookingStatus;

  /**
   * Why the Booking was cancelled: `CUSTOMER` (they called it off) or
   * `PAYMENT_DECLINED` (the provider refused). Null unless status is
   * CANCELLED — a lapsed hold is EXPIRED, not cancelled, so it carries no
   * reason.
   */
  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  cancellationReason: CancellationReason | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /**
   * When payment-service reported the money settled. A PENDING booking with
   * `paidAt` is paid but not yet ticketed; it becomes CONFIRMED only after
   * ticket-service publishes `tickets.issued`.
   */
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  /** Set when ticket-service confirms tickets exist for this booking. */
  @Column({ name: 'tickets_issued_at', type: 'timestamptz', nullable: true })
  ticketsIssuedAt: Date | null;

  /**
   * Last time booking-service re-published `booking.confirmed` for a paid but
   * unticketed booking. Throttles the retry cron so ticket-service and the
   * mailer are not spammed every minute.
   */
  @Column({
    name: 'confirmation_attempted_at',
    type: 'timestamptz',
    nullable: true,
  })
  confirmationAttemptedAt: Date | null;

  @Column({ name: 'refund_requested_at', type: 'timestamptz', nullable: true })
  refundRequestedAt: Date | null;

  @OneToMany(() => BookingSeat, (seat) => seat.booking)
  seats: BookingSeat[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
