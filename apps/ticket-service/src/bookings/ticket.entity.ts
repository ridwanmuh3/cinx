import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Booking } from './booking.entity';

@Entity('tickets')
@Index(['code'], { unique: true })
@Index(['booking'])
@Index(['booking', 'seatId'], { unique: true })
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Booking, (booking) => booking.tickets, {
    onDelete: 'CASCADE',
  })
  booking: Booking;

  @Column({ type: 'varchar', length: 16, unique: true })
  code: string; // TKT-XXXXXX

  @Column({ name: 'movie_title', type: 'varchar', length: 200 })
  movieTitle: string;

  @Column({ name: 'theater_name', type: 'varchar', length: 200 })
  theaterName: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'seat_id', type: 'varchar', length: 100 })
  seatId: string;

  @Column({ name: 'row_label', type: 'varchar', length: 2 })
  rowLabel: string;

  @Column({ name: 'seat_number', type: 'int' })
  seatNumber: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
