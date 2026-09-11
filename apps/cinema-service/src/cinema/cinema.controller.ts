import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CinemaPatterns, validateDto } from '@ticketing/shared';
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
import { ListQueryDto } from '../cinema/dto/list-query.dto';

@Controller()
export class CinemaController {
  constructor(
    private readonly movies: MoviesService,
    private readonly theaters: TheatersService,
    private readonly showtimes: ShowtimesService,
  ) {}

  @GrpcMethod('CinemaService', CinemaPatterns.MOVIES_LIST)
  async listMovies(req: ListMoviesQueryDto) {
    await validateDto(req, ListMoviesQueryDto);
    return this.movies.list(req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.MOVIE_GET)
  getMovie(req: { id: string }) {
    return this.movies.one(req.id);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.MOVIE_CREATE)
  async createMovie(req: CreateMovieDto) {
    await validateDto(req, CreateMovieDto);
    return this.movies.create(req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.MOVIE_UPDATE)
  async updateMovie(req: UpdateMovieDto & { id: string }) {
    await validateDto(req, UpdateMovieDto);
    return this.movies.update(req.id, req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.MOVIE_DELETE)
  async deleteMovie(req: { id: string }) {
    await this.movies.remove(req.id);
    return {};
  }

  @GrpcMethod('CinemaService', CinemaPatterns.THEATERS_LIST)
  async listTheaters(req: ListQueryDto) {
    await validateDto(req, ListQueryDto);
    return this.theaters.list(req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.THEATER_GET)
  getTheater(req: { id: string }) {
    return this.theaters.one(req.id);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.THEATER_CREATE)
  async createTheater(req: CreateTheaterDto) {
    await validateDto(req, CreateTheaterDto);
    // Normalize to the flat proto wire shape (name, address, rows, cols).
    return this.theaters.create({
      name: req.name,
      address: req.address,
      rows: req.layout?.rows ?? req.rows ?? 0,
      cols: req.layout?.cols ?? req.cols ?? 0,
    });
  }

  @GrpcMethod('CinemaService', CinemaPatterns.THEATER_UPDATE)
  async updateTheater(req: UpdateTheaterDto & { id: string }) {
    await validateDto(req, UpdateTheaterDto);
    return this.theaters.update(req.id, req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.THEATER_DELETE)
  async deleteTheater(req: { id: string }) {
    await this.theaters.remove(req.id);
    return {};
  }

  @GrpcMethod('CinemaService', CinemaPatterns.SHOWTIMES_LIST)
  async listShowtimes(req: ListShowtimesQueryDto) {
    await validateDto(req, ListShowtimesQueryDto);
    return this.showtimes.list(req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.SHOWTIME_GET)
  getShowtime(req: { id: string }) {
    return this.showtimes.one(req.id);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.SHOWTIME_CREATE)
  async createShowtime(req: CreateShowtimeDto) {
    await validateDto(req, CreateShowtimeDto);
    return this.showtimes.create(req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.SHOWTIME_UPDATE)
  async updateShowtime(req: UpdateShowtimeDto & { id: string }) {
    await validateDto(req, UpdateShowtimeDto);
    return this.showtimes.update(req.id, req);
  }

  @GrpcMethod('CinemaService', CinemaPatterns.SHOWTIME_DELETE)
  async deleteShowtime(req: { id: string }) {
    await this.showtimes.remove(req.id);
    return {};
  }

  @GrpcMethod('CinemaService', CinemaPatterns.SHOWTIME_SEATS)
  seatMap(req: { id: string }) {
    return this.showtimes.seatMap(req.id);
  }
}
