import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Seat } from './seat.entity';
import { Showtime } from '../movies/showtime.entity';

@Entity('theaters')
export class Theater {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @OneToMany(() => Seat, (seat) => seat.theater)
  seats: Seat[];

  @OneToMany(() => Showtime, (showtime) => showtime.theater)
  showtimes: Showtime[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
