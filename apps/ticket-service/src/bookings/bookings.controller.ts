import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCancelRequest,
  BookingDto,
  BookingGetRequest,
  BookingListRequest,
  Empty,
  HoldResponse,
  HoldSeatsRequest,
  PaginatedBookings,
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentSyncRequest,
  PaymentWebhookRequest,
  TicketByCodeRequest,
  TicketList,
  TicketLookupDto,
  TicketPatterns,
} from '@ticketing/shared';
import { BookingsService } from './bookings.service';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @GrpcMethod('TicketService', TicketPatterns.BOOKING_HOLD)
  hold(@Payload() dto: HoldSeatsRequest): Promise<HoldResponse> {
    return this.bookings.hold(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.BOOKING_CANCEL)
  cancel(@Payload() dto: BookingCancelRequest): Promise<BookingDto> {
    return this.bookings.cancel(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.BOOKING_GET)
  get(@Payload() dto: BookingGetRequest): Promise<BookingDto> {
    return this.bookings.get(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.BOOKING_LIST)
  list(@Payload() dto: BookingListRequest): Promise<PaginatedBookings> {
    return this.bookings.list(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.BOOKING_AVAILABILITY)
  availability(
    @Payload() dto: BookingAvailabilityRequest,
  ): Promise<BookingAvailabilityResponse> {
    return this.bookings.availability(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.PAYMENT_CHARGE)
  charge(@Payload() dto: PaymentChargeRequest): Promise<PaymentChargeResponse> {
    return this.bookings.charge(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.PAYMENT_WEBHOOK)
  webhook(@Payload() dto: PaymentWebhookRequest): Promise<Empty> {
    return this.bookings.webhook(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.PAYMENT_SYNC)
  syncPaymentStatus(@Payload() dto: PaymentSyncRequest): Promise<BookingDto> {
    return this.bookings.syncPaymentStatus(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.TICKET_ISSUE)
  issueTickets(@Payload() dto: BookingGetRequest): Promise<TicketList> {
    return this.bookings.issueTickets(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.TICKET_LIST)
  listTickets(@Payload() dto: BookingGetRequest): Promise<TicketList> {
    return this.bookings.listTickets(dto);
  }

  @GrpcMethod('TicketService', TicketPatterns.TICKET_GET_BY_CODE)
  getTicketByCode(
    @Payload() dto: TicketByCodeRequest,
  ): Promise<TicketLookupDto> {
    return this.bookings.getTicketByCode(dto);
  }
}
