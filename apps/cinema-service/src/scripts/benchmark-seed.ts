import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { buildPgUrl, PG_DBS } from '@ticketing/shared';
import { generateSeatGrid } from '../cinema/mappers';
import { Genre } from '../movies/genre.entity';
import { Movie } from '../movies/movie.entity';
import { Showtime } from '../movies/showtime.entity';
import { Seat } from '../theaters/seat.entity';
import { Theater } from '../theaters/theater.entity';

// Adds a dedicated benchmark catalog without touching the demo catalog.
// Showtimes all share one 96-seat theater, so N showtimes provide N * 96
// independently bookable (showtime, seat) pairs.
const MOVIE_TITLE = 'Benchmark Feature';
const THEATER_NAME = 'Benchmark Hall';
const SHOWTIMES = Number(process.env.BENCH_SHOWTIMES || 60);
const ROWS = Number(process.env.BENCH_ROWS || 8);
const COLS = Number(process.env.BENCH_COLS || 12);
const ROOT = process.env.INIT_CWD || process.cwd();
const OUTPUT = path.resolve(
  process.env.BENCH_CATALOG_FILE ||
    path.join(ROOT, 'benchmark/.data/catalog.json'),
);

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: buildPgUrl(PG_DBS.CINEMA),
    entities: [Movie, Genre, Showtime, Theater, Seat],
    synchronize: false,
  });
  await ds.initialize();

  const movies = ds.getRepository(Movie);
  const theaters = ds.getRepository(Theater);
  const seats = ds.getRepository(Seat);
  const showtimes = ds.getRepository(Showtime);

  // Remove only previous benchmark rows; the demo catalog is left untouched.
  const oldMovie = await movies.findOne({ where: { title: MOVIE_TITLE } });
  const oldTheater = await theaters.findOne({
    where: { name: THEATER_NAME },
  });

  if (oldMovie) {
    await showtimes
      .createQueryBuilder()
      .delete()
      .where('"movieId" = :id', { id: oldMovie.id })
      .execute();
  }
  if (oldTheater) {
    await showtimes
      .createQueryBuilder()
      .delete()
      .where('"theaterId" = :id', { id: oldTheater.id })
      .execute();
    await seats
      .createQueryBuilder()
      .delete()
      .where('"theaterId" = :id', { id: oldTheater.id })
      .execute();
    await theaters.delete(oldTheater.id);
  }
  if (oldMovie) {
    await movies.delete(oldMovie.id);
  }

  const movie = await movies.save({
    title: MOVIE_TITLE,
    synopsis: 'Synthetic catalog for load testing.',
    genres: [],
    durationMinutes: 90,
    ageRating: 'SU',
    posterUrl: null,
    releaseDate: new Date().toISOString().slice(0, 10),
    status: 'NOW_SHOWING',
  });

  const theater = await theaters.save({
    name: THEATER_NAME,
    address: 'Benchmark data — safe to delete',
  });
  const seatRows = await seats.save(
    generateSeatGrid({ rows: ROWS, cols: COLS }, theater.id),
  );

  const base = Date.now() + 24 * 60 * 60 * 1000;
  const showtimeRows = await showtimes.save(
    Array.from({ length: SHOWTIMES }, (_, index) => ({
      movie: { id: movie.id } as Movie,
      theater: { id: theater.id } as Theater,
      startsAt: new Date(base + index * 30 * 60 * 1000),
      priceAmount: 50000,
      priceCurrency: 'IDR',
    })),
  );

  const catalog = {
    generatedAt: new Date().toISOString(),
    movieId: movie.id,
    theaterId: theater.id,
    seats: seatRows.map((seat) => ({
      id: seat.id,
      row: seat.rowLabel,
      number: seat.seatNumber,
    })),
    showtimes: showtimeRows.map((showtime) => ({
      id: showtime.id,
      startsAt: showtime.startsAt.toISOString(),
      seatIds: seatRows.map((seat) => seat.id),
    })),
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  console.log('[benchmark-seed] catalog ready');
  console.log(`  theater:   ${theater.id} (${seatRows.length} seats)`);
  console.log(`  showtimes: ${showtimeRows.length}`);
  console.log(`  slots:     ${showtimeRows.length * seatRows.length}`);
  console.log(`  output:    ${OUTPUT}`);

  await ds.destroy();
}

void main().catch((err) => {
  console.error('[benchmark-seed] FAILED', err);
  process.exitCode = 1;
});
