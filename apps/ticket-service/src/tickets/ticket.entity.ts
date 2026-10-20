import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tickets')
@Index(['code'], { unique: true })
@Index(['bookingId'])
@Index(['bookingId', 'seatId'], { unique: true })
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Logical reference to booking_db. No cross-database FK: ticket-service
   * learns about bookings through events.
   */
  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'showtime_id', type: 'uuid' })
  showtimeId: string;

  @Column({ type: 'varchar', length: 16, unique: true })
  code: string; // TKT-XXXXXXXX

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
