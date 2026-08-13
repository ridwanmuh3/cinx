import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeatCategory } from '@ticketing/shared';
import { Theater } from './theater.entity';

@Entity('seats')
@Index(['theater', 'rowLabel', 'seatNumber'], { unique: true })
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Theater, (theater) => theater.seats, {
    onDelete: 'CASCADE',
  })
  theater: Theater;

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

  @Column({ name: 'is_accessible', type: 'boolean', default: false })
  isAccessible: boolean;

  @Column({ name: 'is_disabled', type: 'boolean', default: false })
  isDisabled: boolean;
}
