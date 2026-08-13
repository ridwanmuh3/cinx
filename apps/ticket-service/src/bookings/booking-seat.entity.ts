import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeatCategory } from '@ticketing/shared';
import { Booking } from './booking.entity';

@Entity('booking_seats')
@Index(['booking'])
@Index(['showtimeId', 'seatId'], { unique: true })
export class BookingSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Booking, (booking) => booking.seats, {
    onDelete: 'CASCADE',
  })
  booking: Booking;

  @Column({ name: 'showtime_id', type: 'uuid' })
  showtimeId: string;

  @Column({ name: 'seat_id', type: 'uuid' })
  seatId: string;

  @Column({ name: 'row_label', type: 'varchar', length: 2 })
  rowLabel: string;

  @Column({ name: 'seat_number', type: 'int' })
  seatNumber: number;

  @Column({
    type: 'enum',
    enum: ['REGULAR', 'VIP', 'COUPLE'],
    default: 'REGULAR',
  })
  category: SeatCategory;

  @Column({ name: 'price_amount', type: 'int' })
  priceAmount: number;

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: 'IDR',
  })
  priceCurrency: string;
}
