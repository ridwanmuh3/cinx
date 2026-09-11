import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import {
  CreateTheaterRequest,
  ListQuery,
  PaginatedTheaters,
  PaginationMeta,
  TheaterDto,
  TheaterUpdateRequest,
  rpcErrorPayload,
} from '@ticketing/shared';
import { Theater } from './theater.entity';
import { Seat } from './seat.entity';
import { buildMeta, generateSeatGrid, toTheaterDto } from '../cinema/mappers';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class TheatersService {
  constructor(
    @InjectRepository(Theater) private readonly theaters: Repository<Theater>,
    @InjectRepository(Seat) private readonly seats: Repository<Seat>,
  ) {}

  async list(query: ListQuery): Promise<PaginatedTheaters> {
    const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(query.limit) || DEFAULT_LIMIT),
    );
    const skip = (page - 1) * limit;

    const items = await this.theaters.find({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: { seats: true },
    });
    const total = await this.theaters.count();
    const meta: PaginationMeta = buildMeta(page, limit, total);
    return { items: items.map(toTheaterDto), meta };
  }

  async one(id: string): Promise<TheaterDto> {
    const theater = await this.theaters.findOne({
      where: { id },
      relations: { seats: true },
    });
    if (!theater) {
      throw new RpcException(rpcErrorPayload(404, 'Theater not found'));
    }
    return toTheaterDto(theater);
  }

  async create(dto: CreateTheaterRequest): Promise<TheaterDto> {
    const theater = this.theaters.create({
      name: dto.name,
      address: dto.address,
    });
    const saved = await this.theaters.save(theater);
    const seats = generateSeatGrid({ rows: dto.rows, cols: dto.cols }, saved.id);
    await this.seats.save(seats);
    const reloaded = await this.theaters.findOneOrFail({
      where: { id: saved.id },
      relations: { seats: true },
    });
    return toTheaterDto(reloaded);
  }

  async update(id: string, dto: TheaterUpdateRequest): Promise<TheaterDto> {
    const theater = await this.mustFind(id);
    Object.assign(theater, {
      ...(dto.name && { name: dto.name }),
      ...(dto.address && { address: dto.address }),
    });
    const saved = await this.theaters.save(theater);
    return toTheaterDto(saved);
  }

  async remove(id: string): Promise<{ id: string }> {
    const theater = await this.mustFind(id);
    await this.theaters.remove(theater);
    return { id };
  }

  private async mustFind(id: string): Promise<Theater> {
    const theater = await this.theaters.findOne({ where: { id } });
    if (!theater) {
      throw new RpcException(rpcErrorPayload(404, 'Theater not found'));
    }
    return theater;
  }
}
