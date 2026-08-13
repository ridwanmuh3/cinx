import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { generateSeatGrid } from '../cinema/mappers';
import { Genre } from '../movies/genre.entity';
import { Movie } from '../movies/movie.entity';
import { Showtime } from '../movies/showtime.entity';
import { Seat } from '../theaters/seat.entity';
import { Theater } from '../theaters/theater.entity';

const SHOW_BASE = new Date('2026-08-20T18:00:00.000Z');

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: buildPgUrl(PG_DBS.CINEMA),
    entities: [Movie, Genre, Showtime, Theater, Seat],
    synchronize: true,
  });
  await ds.initialize();

  await ds.getRepository(Showtime).createQueryBuilder().delete().execute();
  await ds.getRepository(Seat).createQueryBuilder().delete().execute();
  await ds.getRepository(Theater).createQueryBuilder().delete().execute();
  await ds.getRepository(Movie).createQueryBuilder().delete().execute();
  await ds.getRepository(Genre).createQueryBuilder().delete().execute();

  const genreNames = ['Adventure', 'Fantasy', 'Romance', 'Drama', 'Comedy'];
  const genres = await ds
    .getRepository(Genre)
    .save(genreNames.map((name) => ({ name })));
  const byName = new Map(genres.map((g) => [g.name, g]));

  function genreRef(names: string[]) {
    return names.map((n) => byName.get(n)).filter((g) => g !== undefined);
  }

  const grandAdventure = await ds.getRepository(Movie).save({
    title: 'The Grand Adventure',
    synopsis: 'A sweeping journey across an uncharted continent.',
    genres: genreRef(['Adventure', 'Fantasy']),
    durationMinutes: 128,
    ageRating: '13+',
    posterUrl: null,
    releaseDate: '2026-08-01',
    status: 'NOW_SHOWING',
  });
  const secondDate = await ds.getRepository(Movie).save({
    title: 'Cinta Pertama',
    synopsis: 'A story of first love and second chances.',
    genres: genreRef(['Romance', 'Drama']),
    durationMinutes: 105,
    ageRating: '17+',
    posterUrl: null,
    releaseDate: '2026-07-15',
    status: 'ENDED',
  });
  const comedy = await ds.getRepository(Movie).save({
    title: 'Komedi Nasional',
    synopsis: 'Laugh-out-loud moments across the archipelago.',
    genres: genreRef(['Comedy']),
    durationMinutes: 95,
    ageRating: 'SU',
    posterUrl: 'https://example.com/posters/komedi-nasional.jpg',
    releaseDate: '2026-09-10',
    status: 'COMING_SOON',
  });

  const theater = await ds.getRepository(Theater).save({
    name: 'Grand Cineplex 1',
    address: 'Jl. Sudirman No. 1, Jakarta',
  });
  await ds
    .getRepository(Seat)
    .save(generateSeatGrid({ rows: 8, cols: 12 }, theater.id));

  const st1 = await ds.getRepository(Showtime).save({
    movie: { id: grandAdventure.id } as Movie,
    theater: { id: theater.id } as Theater,
    startsAt: new Date(SHOW_BASE.getTime()),
    priceAmount: 50000,
    priceCurrency: 'IDR',
  });
  const st2 = await ds.getRepository(Showtime).save({
    movie: { id: grandAdventure.id } as Movie,
    theater: { id: theater.id } as Theater,
    startsAt: new Date(SHOW_BASE.getTime() + 3 * 60 * 60_000),
    priceAmount: 50000,
    priceCurrency: 'IDR',
  });
  const st3 = await ds.getRepository(Showtime).save({
    movie: { id: secondDate.id } as Movie,
    theater: { id: theater.id } as Theater,
    startsAt: new Date(SHOW_BASE.getTime() + 25 * 60 * 60_000),
    priceAmount: 45000,
    priceCurrency: 'IDR',
  });

  console.log('[seed] cinema_db demo data:');
  console.log(`  movies: 3`);
  console.log(`  theater: ${theater.id} (seats: ${12 * 8})`);
  console.log(`  showtimes: 3`);
  void st1;
  void st2;
  void st3;
  void comedy;
  await ds.destroy();
}

void main().catch((err) => {
  console.error('[seed] FAILED', err);
  process.exitCode = 1;
});
