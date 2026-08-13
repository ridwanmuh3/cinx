import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CinemaPatterns } from '@ticketing/shared';
import { MoviesService } from '../movies/movies.service';
import { ShowtimesService } from '../showtimes/showtimes.service';
import { TheatersService } from '../theaters/theaters.service';
import {
  CreateMovieDto,
  CreateShowtimeDto,
  CreateTheaterDto,
  ListMoviesQueryDto,
  ListShowtimesQueryDto,
  UpdateMovieDto,
  UpdateShowtimeDto,
  UpdateTheaterDto,
} from '../movies/movies.dto';
import { ListQueryDto } from './dto/list-query.dto';

@Controller()
export class CinemaController {
  constructor(
    private readonly movies: MoviesService,
    private readonly theaters: TheatersService,
    private readonly showtimes: ShowtimesService,
  ) {}

  @MessagePattern(CinemaPatterns.MOVIES_LIST)
  listMovies(@Payload() q: ListMoviesQueryDto) {
    return this.movies.list(q);
  }

  @MessagePattern(CinemaPatterns.MOVIE_GET)
  getMovie(@Payload() payload: { id: string }) {
    return this.movies.one(payload.id);
  }

  @MessagePattern(CinemaPatterns.MOVIE_CREATE)
  createMovie(@Payload() dto: CreateMovieDto) {
    return this.movies.create(dto);
  }

  @MessagePattern(CinemaPatterns.MOVIE_UPDATE)
  updateMovie(@Payload() payload: { id: string } & UpdateMovieDto) {
    return this.movies.update(payload.id, payload);
  }

  @MessagePattern(CinemaPatterns.MOVIE_DELETE)
  deleteMovie(@Payload() payload: { id: string }) {
    return this.movies.remove(payload.id);
  }

  @MessagePattern(CinemaPatterns.THEATERS_LIST)
  listTheaters(@Payload() q: ListQueryDto) {
    return this.theaters.list(q);
  }

  @MessagePattern(CinemaPatterns.THEATER_GET)
  getTheater(@Payload() payload: { id: string }) {
    return this.theaters.one(payload.id);
  }

  @MessagePattern(CinemaPatterns.THEATER_CREATE)
  createTheater(@Payload() dto: CreateTheaterDto) {
    return this.theaters.create(dto);
  }

  @MessagePattern(CinemaPatterns.THEATER_UPDATE)
  updateTheater(@Payload() payload: { id: string } & UpdateTheaterDto) {
    return this.theaters.update(payload.id, payload);
  }

  @MessagePattern(CinemaPatterns.THEATER_DELETE)
  deleteTheater(@Payload() payload: { id: string }) {
    return this.theaters.remove(payload.id);
  }

  @MessagePattern(CinemaPatterns.SHOWTIMES_LIST)
  listShowtimes(@Payload() q: ListShowtimesQueryDto) {
    return this.showtimes.list(q);
  }

  @MessagePattern(CinemaPatterns.SHOWTIME_GET)
  getShowtime(@Payload() payload: { id: string }) {
    return this.showtimes.one(payload.id);
  }

  @MessagePattern(CinemaPatterns.SHOWTIME_CREATE)
  createShowtime(@Payload() dto: CreateShowtimeDto) {
    return this.showtimes.create(dto);
  }

  @MessagePattern(CinemaPatterns.SHOWTIME_UPDATE)
  updateShowtime(@Payload() payload: { id: string } & UpdateShowtimeDto) {
    return this.showtimes.update(payload.id, payload);
  }

  @MessagePattern(CinemaPatterns.SHOWTIME_DELETE)
  deleteShowtime(@Payload() payload: { id: string }) {
    return this.showtimes.remove(payload.id);
  }

  @MessagePattern(CinemaPatterns.SHOWTIME_SEATS)
  seatMap(@Payload() payload: { id: string }) {
    return this.showtimes.seatMap(payload.id);
  }
}
