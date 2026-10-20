import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethod, PaymentStatus } from '@ticketing/shared';

/**
 * One payment record per Booking. `bookingId` is a logical reference to
 * booking_db; there is deliberately no cross-database foreign key.
 */
@Entity('payments')
@Index(['status'])
@Index(['bookingId'], { unique: true })
@Index(['externalId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  /**
   * Our own reference handed to the provider (`cix-{bookingId}`), so we can
   * recognise a callback.
   */
  @Column({ name: 'external_id', type: 'varchar', length: 200 })
  externalId: string;

  /**
   * The provider's identifier for the settled payment. The Invoices API does
   * not hand back a separate transaction id, so this stays null rather than
   * duplicating `invoiceId`.
   */
  @Column({
    name: 'provider_txn_id',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  providerTxnId: string | null;

  @Column({ name: 'amount', type: 'int' })
  amount: number;

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: 'IDR',
  })
  currency: 'IDR';

  @Column({
    type: 'enum',
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED'],
    default: 'PENDING',
  })
  status: PaymentStatus;

  /** Provider refund id (Xendit `rfd-…`), set when a refund is requested. */
  @Column({ name: 'refund_id', type: 'varchar', length: 200, nullable: true })
  refundId: string | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'receipt_url', type: 'varchar', length: 512, nullable: true })
  receiptUrl: string | null;

  @Column({ name: 'invoice_id', type: 'varchar', length: 200, nullable: true })
  invoiceId: string | null;

  @Column({
    name: 'checkout_url',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  checkoutUrl: string | null;

  @Column({
    name: 'method',
    type: 'varchar',
    length: 20,
    default: 'XENDIT',
  })
  method: PaymentMethod;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
