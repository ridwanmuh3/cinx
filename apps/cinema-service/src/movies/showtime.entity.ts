import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Movie } from './movie.entity';
import { Theater } from '../theaters/theater.entity';

@Entity('showtimes')
@Index(['movie'])
@Index(['theater'])
@Index(['theater', 'startsAt'])
export class Showtime {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Movie, (movie) => movie.showtimes, {
    onDelete: 'RESTRICT',
  })
  movie: Movie;

  @ManyToOne(() => Theater, (theater) => theater.showtimes, {
    onDelete: 'RESTRICT',
  })
  theater: Theater;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'price_amount', type: 'int' })
  priceAmount: number;

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: 'IDR',
  })
  priceCurrency: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
