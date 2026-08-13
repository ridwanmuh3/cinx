import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { In, Repository } from 'typeorm';
import {
  CreateMovieRequest,
  ListMoviesQuery,
  PaginatedMovies,
  PaginationMeta,
  MovieDto,
  MovieUpdateRequest,
  rpcErrorPayload,
} from '@ticketing/shared';
import { Genre } from './genre.entity';
import { Movie } from './movie.entity';
import { Showtime } from './showtime.entity';
import { buildMeta, toMovieDto } from '../cinema/mappers';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class MoviesService {
  constructor(
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    @InjectRepository(Genre) private readonly genres: Repository<Genre>,
    @InjectRepository(Showtime)
    private readonly showtimes: Repository<Showtime>,
  ) {}

  async list(query: ListMoviesQuery): Promise<PaginatedMovies> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(query.limit) || DEFAULT_LIMIT),
    );
    const skip = (page - 1) * limit;

    const qb = this.movies
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.genres', 'genre');

    if (query.q) {
      qb.andWhere('movie.title ILIKE :q', { q: `%${query.q}%` });
    }
    if (query.genre) {
      qb.andWhere('genre.name = :genre', { genre: query.genre });
    }
    if (query.nowPlaying === true) {
      qb.andWhere('movie.status = :status', { status: 'NOW_SHOWING' });
    }

    const [items, total] = await qb
      .orderBy('movie.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    const meta: PaginationMeta = buildMeta(page, limit, total);
    return { items: items.map(toMovieDto), meta };
  }

  async one(id: string): Promise<MovieDto> {
    const movie = await this.mustFind(id);
    return toMovieDto(movie);
  }

  async create(dto: CreateMovieRequest): Promise<MovieDto> {
    const genres = await this.resolveGenres(dto.genres);
    const movie = this.movies.create({
      title: dto.title,
      synopsis: dto.synopsis,
      genres,
      durationMinutes: dto.durationMinutes,
      ageRating: dto.ageRating,
      posterUrl: dto.posterUrl ?? null,
      releaseDate: dto.releaseDate,
      status: dto.status ?? 'NOW_SHOWING',
    });
    const saved = await this.movies.save(movie);
    return toMovieDto(await this.reload(saved.id));
  }

  async update(id: string, dto: MovieUpdateRequest): Promise<MovieDto> {
    const movie = await this.mustFind(id);
    Object.assign(movie, {
      ...(dto.title && { title: dto.title }),
      ...(dto.synopsis && { synopsis: dto.synopsis }),
      ...(dto.genres && { genres: await this.resolveGenres(dto.genres) }),
      ...(dto.durationMinutes != null && {
        durationMinutes: dto.durationMinutes,
      }),
      ...(dto.ageRating && { ageRating: dto.ageRating }),
      ...('posterUrl' in dto && { posterUrl: dto.posterUrl ?? null }),
      ...(dto.releaseDate && { releaseDate: dto.releaseDate }),
      ...(dto.status && { status: dto.status }),
    });
    const saved = await this.movies.save(movie);
    return toMovieDto(await this.reload(saved.id));
  }

  async remove(id: string): Promise<{ id: string }> {
    const movie = await this.mustFind(id);
    const hasShowtimes = await this.showtimes.count({
      where: { movie: { id } },
    });
    if (hasShowtimes > 0) {
      throw new RpcException(
        rpcErrorPayload(409, 'Movie has showtimes and cannot be deleted'),
      );
    }
    await this.movies.remove(movie);
    return { id };
  }

  private async mustFind(id: string): Promise<Movie> {
    const movie = await this.movies.findOne({
      where: { id },
      relations: { genres: true },
    });
    if (!movie) {
      throw new RpcException(rpcErrorPayload(404, 'Movie not found'));
    }
    return movie;
  }

  private async reload(id: string): Promise<Movie> {
    return this.movies.findOneOrFail({
      where: { id },
      relations: { genres: true },
    });
  }

  private async resolveGenres(names: string[]): Promise<Genre[]> {
    const requested = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (requested.length === 0) return [];

    const existing = await this.genres.find({
      where: { name: In(requested) },
    });
    const existingNames = new Set(existing.map((g) => g.name));

    const missing = requested
      .filter((n) => !existingNames.has(n))
      .map((n) => this.genres.create({ name: n }));
    if (missing.length > 0) {
      await this.genres.save(missing);
      existing.push(...missing);
    }

    return existing.filter((g) => requested.includes(g.name));
  }
}
