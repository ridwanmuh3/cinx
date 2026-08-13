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
@Index(['providerId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Booking, (booking) => booking.payments, {
    onDelete: 'CASCADE',
  })
  booking: Booking;

  @Column({ name: 'provider_id', type: 'varchar', length: 200 })
  providerId: string;

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
    enum: ['PENDING', 'PAID', 'FAILED'],
    default: 'PENDING',
  })
  status: PaymentStatus;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'receipt_url', type: 'varchar', length: 512, nullable: true })
  receiptUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
