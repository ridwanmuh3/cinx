import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '@ticketing/shared';
import { Booking } from './booking.entity';

@Entity('payments')
@Index(['status'])
@Index(['externalId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Booking, (booking) => booking.payments, {
    onDelete: 'CASCADE',
  })
  booking: Booking;

  /**
   * Our own reference handed to the provider (`cix-{bookingId}`), so we can
   * recognise a callback. Not the provider's identifier — that is a lie the
   * old name `provider_id` told.
   */
  @Column({ name: 'external_id', type: 'varchar', length: 200 })
  externalId: string;

  /**
   * The provider's identifier for the settled payment. Distinct from
   * `invoiceId`: the Invoices API does not hand back a separate transaction
   * id, so this stays null rather than being filled with the invoice id.
   */
  @Column({
    name: 'provider_txn_id',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  providerTxnId: string | null;

  @Column({
    name: 'amount',
    type: 'int',
  })
  amount: number;

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: 'IDR',
  })
  currency: string;

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

  @Column({ name: 'method', type: 'varchar', length: 20, default: 'XENDIT' })
  method: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
