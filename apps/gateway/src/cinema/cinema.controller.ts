import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ListMoviesQuery,
  ListQuery,
  ListShowtimesQuery,
  MovieDto,
  PaginatedMovies,
  PaginatedShowtimes,
  PaginatedTheaters,
  ShowtimeDto,
  TheaterDto,
} from '@ticketing/shared';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Public } from '../common/auth/public.decorator';
import { Roles, RolesGuard } from '../common/auth/roles.guard';
import { toPositiveInt } from '../utils/paging.util';
import { CinemaService, GatewaySeatMap } from './cinema.service';
import {
  CreateMovieDto,
  CreateShowtimeDto,
  CreateTheaterDto,
  UpdateMovieDto,
  UpdateShowtimeDto,
  UpdateTheaterDto,
} from './dto/cinema.dto';

const MAX_LIMIT = 100;

function buildListQuery(
  q: Record<string, unknown>,
): ListMoviesQuery | ListShowtimesQuery {
  const query: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'page' || k === 'limit') {
      query[k] = toPositiveInt(v, 1, MAX_LIMIT);
      continue;
    }
    if (k === 'nowPlaying') {
      if (typeof v === 'string') {
        const low = v.toLowerCase();
        query[k] = low === 'true' ? true : low === 'false' ? false : v;
      } else {
        query[k] = v;
      }
      continue;
    }
    query[k] = v;
  }
  return query as ListMoviesQuery;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CinemaController {
  constructor(private readonly cinema: CinemaService) {}

  // ----- Movies -----

  @Public()
  @Get('movies')
  listMovies(
    @Query() query: Record<string, unknown>,
  ): Promise<PaginatedMovies> {
    return this.cinema.listMovies(buildListQuery(query) as ListMoviesQuery);
  }

  @Public()
  @Get('movies/:id')
  getMovie(@Param('id') id: string): Promise<MovieDto> {
    return this.cinema.getMovie(id);
  }

  @Post('movies')
  @Roles('admin')
  createMovie(@Body() dto: CreateMovieDto): Promise<MovieDto> {
    return this.cinema.createMovie(dto);
  }

  @Patch('movies/:id')
  @Roles('admin')
  updateMovie(
    @Param('id') id: string,
    @Body() dto: UpdateMovieDto,
  ): Promise<MovieDto> {
    return this.cinema.updateMovie(id, dto);
  }

  @Delete('movies/:id')
  @Roles('admin')
  @HttpCode(204)
  deleteMovie(@Param('id') id: string): Promise<void> {
    return this.cinema.deleteMovie(id);
  }

  // ----- Theaters -----

  @Public()
  @Get('theaters')
  listTheaters(
    @Query() query: Record<string, unknown>,
  ): Promise<PaginatedTheaters> {
    return this.cinema.listTheaters(buildListQuery(query) as ListQuery);
  }

  @Public()
  @Get('theaters/:id')
  getTheater(@Param('id') id: string): Promise<TheaterDto> {
    return this.cinema.getTheater(id);
  }

  @Post('theaters')
  @Roles('admin')
  createTheater(@Body() dto: CreateTheaterDto): Promise<TheaterDto> {
    return this.cinema.createTheater(dto);
  }

  @Patch('theaters/:id')
  @Roles('admin')
  updateTheater(
    @Param('id') id: string,
    @Body() dto: UpdateTheaterDto,
  ): Promise<TheaterDto> {
    return this.cinema.updateTheater(id, dto);
  }

  @Delete('theaters/:id')
  @Roles('admin')
  @HttpCode(204)
  deleteTheater(@Param('id') id: string): Promise<void> {
    return this.cinema.deleteTheater(id);
  }

  // ----- Showtimes -----

  @Public()
  @Get('showtimes')
  listShowtimes(
    @Query() query: Record<string, unknown>,
  ): Promise<PaginatedShowtimes> {
    return this.cinema.listShowtimes(
      buildListQuery(query) as ListShowtimesQuery,
    );
  }

  @Public()
  @Get('showtimes/:id')
  getShowtime(@Param('id') id: string): Promise<ShowtimeDto> {
    return this.cinema.getShowtime(id);
  }

  @Public()
  @Get('showtimes/:id/seats')
  getShowtimeSeats(@Param('id') id: string): Promise<GatewaySeatMap> {
    return this.cinema.seatMap(id);
  }

  @Post('showtimes')
  @Roles('admin')
  createShowtime(@Body() dto: CreateShowtimeDto): Promise<ShowtimeDto> {
    return this.cinema.createShowtime(dto);
  }

  @Patch('showtimes/:id')
  @Roles('admin')
  updateShowtime(
    @Param('id') id: string,
    @Body() dto: UpdateShowtimeDto,
  ): Promise<ShowtimeDto> {
    return this.cinema.updateShowtime(id, dto);
  }

  @Delete('showtimes/:id')
  @Roles('admin')
  @HttpCode(204)
  deleteShowtime(@Param('id') id: string): Promise<void> {
    return this.cinema.deleteShowtime(id);
  }
}
