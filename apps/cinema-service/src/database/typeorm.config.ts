import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { Genre } from '../movies/genre.entity';
import { Movie } from '../movies/movie.entity';
import { Showtime } from '../movies/showtime.entity';
import { Seat } from '../theaters/seat.entity';
import { Theater } from '../theaters/theater.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: buildPgUrl(PG_DBS.CINEMA),
  entities: [Movie, Genre, Showtime, Theater, Seat],
  synchronize: true,
};
