import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCancelRequest,
  BookingDto,
  BookingGetRequest,
  BookingListRequest,
  HoldResponse,
  HoldSeatsRequest,
  PaginatedBookings,
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentConfirmRequest,
  TicketByCodeRequest,
  TicketDto,
  TicketLookupDto,
  TicketPatterns,
} from '@ticketing/shared';
import { BookingsService } from './bookings.service';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @MessagePattern(TicketPatterns.BOOKING_HOLD)
  hold(@Payload() dto: HoldSeatsRequest): Promise<HoldResponse> {
    return this.bookings.hold(dto);
  }

  @MessagePattern(TicketPatterns.BOOKING_CANCEL)
  cancel(@Payload() dto: BookingCancelRequest): Promise<BookingDto> {
    return this.bookings.cancel(dto);
  }

  @MessagePattern(TicketPatterns.BOOKING_GET)
  get(@Payload() dto: BookingGetRequest): Promise<BookingDto> {
    return this.bookings.get(dto);
  }

  @MessagePattern(TicketPatterns.BOOKING_LIST)
  list(@Payload() dto: BookingListRequest): Promise<PaginatedBookings> {
    return this.bookings.list(dto);
  }

  @MessagePattern(TicketPatterns.BOOKING_AVAILABILITY)
  availability(
    @Payload() dto: BookingAvailabilityRequest,
  ): Promise<BookingAvailabilityResponse> {
    return this.bookings.availability(dto);
  }

  @MessagePattern(TicketPatterns.PAYMENT_CHARGE)
  charge(@Payload() dto: PaymentChargeRequest): Promise<PaymentChargeResponse> {
    return this.bookings.charge(dto);
  }

  @MessagePattern(TicketPatterns.PAYMENT_CONFIRM)
  confirm(@Payload() dto: PaymentConfirmRequest): Promise<BookingDto> {
    return this.bookings.confirm(dto);
  }

  @MessagePattern(TicketPatterns.TICKET_CREATE)
  createTickets(@Payload() dto: BookingGetRequest): Promise<TicketDto[]> {
    return this.bookings.createTickets(dto);
  }

  @MessagePattern(TicketPatterns.TICKET_GET_BY_CODE)
  getTicketByCode(
    @Payload() dto: TicketByCodeRequest,
  ): Promise<TicketLookupDto> {
    return this.bookings.getTicketByCode(dto);
  }
}
