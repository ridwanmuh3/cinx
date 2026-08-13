import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CinemaController } from './cinema.controller';
import { MoviesService } from '../movies/movies.service';
import { TheatersService } from '../theaters/theaters.service';
import { ShowtimesService } from '../showtimes/showtimes.service';
import { Genre } from '../movies/genre.entity';
import { Movie } from '../movies/movie.entity';
import { Showtime } from '../movies/showtime.entity';
import { Seat } from '../theaters/seat.entity';
import { Theater } from '../theaters/theater.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Movie, Genre, Showtime, Theater, Seat])],
  controllers: [CinemaController],
  providers: [MoviesService, TheatersService, ShowtimesService],
})
export class CinemaModule {}
