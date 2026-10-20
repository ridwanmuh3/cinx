export const TicketRpcPatterns = {
  PING: 'Ping',
  LIST: 'ListTickets',
  GET_BY_CODE: 'GetTicketByCode',
  ISSUE: 'IssueTickets',
  VOID: 'VoidTickets',
} as const;

export interface TicketByCodeRequest {
  code: string;
}

export interface TicketLookupDto {
  id: string;
  code: string;
  bookingId: string;
  showtimeId: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  row: string;
  number: number;
}

export interface TicketDto {
  id: string;
  bookingId: string;
  code: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seatId: string;
  row: string;
  number: number;
  createdAt: string;
}

export interface TicketList {
  items: TicketDto[];
}

export interface TicketListRequest {
  bookingId: string;
}

export interface TicketSeatInput {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
}

export interface TicketIssueRequest {
  bookingId: string;
  userId: string;
  showtimeId: string;
  movieTitle: string;
  theaterName: string;
  startsAt: string;
  seats: TicketSeatInput[];
}

export interface VoidTicketsRequest {
  bookingId: string;
}
