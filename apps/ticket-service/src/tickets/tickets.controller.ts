import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import {
  Empty,
  TicketByCodeRequest,
  TicketIssueRequest,
  TicketList,
  TicketListRequest,
  TicketLookupDto,
  TicketRpcPatterns,
  VoidTicketsRequest,
} from '@ticketing/shared';
import { TicketsService } from './tickets.service';

@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @GrpcMethod('TicketService', TicketRpcPatterns.LIST)
  async list(@Payload() dto: TicketListRequest): Promise<TicketList> {
    return this.tickets.list(dto.bookingId);
  }

  @GrpcMethod('TicketService', TicketRpcPatterns.GET_BY_CODE)
  getByCode(@Payload() dto: TicketByCodeRequest): Promise<TicketLookupDto> {
    return this.tickets.getByCode(dto.code);
  }

  /** Replay/repair path; normal issuance is event-driven. */
  @GrpcMethod('TicketService', TicketRpcPatterns.ISSUE)
  async issue(@Payload() dto: TicketIssueRequest): Promise<TicketList> {
    const rows = await this.tickets.issue(dto);
    return { items: rows.map((ticket) => this.tickets.toDto(ticket)) };
  }

  @GrpcMethod('TicketService', TicketRpcPatterns.VOID)
  async void(@Payload() dto: VoidTicketsRequest): Promise<Empty> {
    await this.tickets.void(dto.bookingId);
    return {};
  }
}
