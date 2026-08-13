import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AgeRating, MovieStatus } from '@ticketing/shared';
import { Genre } from './genre.entity';
import { Showtime } from './showtime.entity';

@Entity('movies')
@Index(['status'])
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  synopsis: string;

  @ManyToMany(() => Genre)
  @JoinTable({ name: 'movie_genres' })
  genres: Genre[];

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes: number;

  @Column({
    name: 'age_rating',
    type: 'enum',
    enum: ['SU', 'BO', '13+', '17+', '21+'],
  })
  ageRating: AgeRating;

  @Column({ name: 'poster_url', type: 'varchar', length: 512, nullable: true })
  posterUrl: string | null;

  @Column({ name: 'release_date', type: 'date' })
  releaseDate: string;

  @Column({
    type: 'enum',
    enum: ['NOW_SHOWING', 'COMING_SOON', 'ENDED'],
    default: 'NOW_SHOWING',
  })
  status: MovieStatus;

  @OneToMany(() => Showtime, (showtime) => showtime.movie)
  showtimes: Showtime[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
