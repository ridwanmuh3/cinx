import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BookingStatus } from '@ticketing/shared';
import { BookingSeat } from './booking-seat.entity';
import { Payment } from './payment.entity';
import { Ticket } from './ticket.entity';

@Entity('bookings')
@Index(['status'])
@Index(['userId'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'showtime_id', type: 'uuid' })
  showtimeId: string;

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
    enum: ['PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
  })
  status: BookingStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @OneToMany(() => Payment, (payment) => payment.booking)
  payments: Payment[];

  @OneToMany(() => Ticket, (ticket) => ticket.booking)
  tickets: Ticket[];

  @OneToMany(() => BookingSeat, (seat) => seat.booking)
  seats: BookingSeat[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
