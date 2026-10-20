import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  rpcErrorPayload,
  TicketDto,
  TicketIssueRequest,
  TicketList,
  TicketLookupDto,
} from '@ticketing/shared';
import { Ticket } from './ticket.entity';
import { generateTicketCode } from './ticket-code';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly tickets: Repository<Ticket>,
  ) {}

  /** Idempotent issuance: a replayed booking.confirmed returns the codes. */
  async issue(dto: TicketIssueRequest): Promise<Ticket[]> {
    if (!dto.bookingId) {
      throw new RpcException(rpcErrorPayload(400, 'bookingId is required'));
    }
    if (!dto.seats || dto.seats.length === 0) {
      throw new RpcException(rpcErrorPayload(400, 'seats are required'));
    }

    const existing = await this.findByBooking(dto.bookingId);
    if (existing.length > 0) return existing;

    const created = dto.seats.map((seat) =>
      this.tickets.create({
        bookingId: dto.bookingId,
        userId: dto.userId,
        showtimeId: dto.showtimeId,
        code: generateTicketCode(),
        movieTitle: dto.movieTitle,
        theaterName: dto.theaterName,
        startsAt: new Date(dto.startsAt),
        seatId: seat.seatId,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
      }),
    );

    try {
      return await this.tickets.save(created);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        // Concurrent replay: the other writer already issued these tickets.
        const raced = await this.findByBooking(dto.bookingId);
        if (raced.length > 0) return raced;
      }
      this.logger.error(
        `ticket issuance failed for booking ${dto.bookingId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  async list(bookingId: string): Promise<TicketList> {
    const rows = await this.findByBooking(bookingId, 'ASC');
    return { items: rows.map((ticket) => this.toDto(ticket)) };
  }

  async getByCode(code: string): Promise<TicketLookupDto> {
    const ticket = await this.tickets.findOne({ where: { code } });
    if (!ticket) {
      throw new RpcException(rpcErrorPayload(404, 'Ticket not found'));
    }
    return {
      id: ticket.id,
      code: ticket.code,
      bookingId: ticket.bookingId,
      showtimeId: ticket.showtimeId,
      movieTitle: ticket.movieTitle,
      theaterName: ticket.theaterName,
      startsAt: ticket.startsAt.toISOString(),
      seatId: ticket.seatId,
      row: ticket.rowLabel,
      number: ticket.seatNumber,
    };
  }

  /** Void every ticket for a booking. Idempotent. */
  async void(bookingId: string): Promise<void> {
    await this.tickets.delete({ bookingId });
  }

  private findByBooking(
    bookingId: string,
    order: 'ASC' | 'DESC' = 'ASC',
  ): Promise<Ticket[]> {
    return this.tickets.find({
      where: { bookingId },
      order: { createdAt: order },
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    );
  }

  toDto(ticket: Ticket): TicketDto {
    return {
      id: ticket.id,
      bookingId: ticket.bookingId,
      code: ticket.code,
      movieTitle: ticket.movieTitle,
      theaterName: ticket.theaterName,
      startsAt: ticket.startsAt.toISOString(),
      seatId: ticket.seatId,
      row: ticket.rowLabel,
      number: ticket.seatNumber,
      createdAt: ticket.createdAt.toISOString(),
    };
  }
}
