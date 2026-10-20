import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import {
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCancelRequest,
  BookingDto,
  BookingGetRequest,
  BookingListRequest,
  BookingRpcPatterns,
  ChargeContext,
  HoldResponse,
  HoldSeatsRequest,
  PaginatedBookings,
} from '@ticketing/shared';
import { BookingsService } from './bookings.service';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @GrpcMethod('BookingService', BookingRpcPatterns.HOLD)
  hold(@Payload() dto: HoldSeatsRequest): Promise<HoldResponse> {
    return this.bookings.hold(dto);
  }

  @GrpcMethod('BookingService', BookingRpcPatterns.CANCEL)
  cancel(@Payload() dto: BookingCancelRequest): Promise<BookingDto> {
    return this.bookings.cancel(dto);
  }

  @GrpcMethod('BookingService', BookingRpcPatterns.GET)
  get(@Payload() dto: BookingGetRequest): Promise<BookingDto> {
    return this.bookings.get(dto);
  }

  @GrpcMethod('BookingService', BookingRpcPatterns.LIST)
  list(@Payload() dto: BookingListRequest): Promise<PaginatedBookings> {
    return this.bookings.list(dto);
  }

  @GrpcMethod('BookingService', BookingRpcPatterns.AVAILABILITY)
  availability(
    @Payload() dto: BookingAvailabilityRequest,
  ): Promise<BookingAvailabilityResponse> {
    return this.bookings.availability(dto);
  }

  @GrpcMethod('BookingService', BookingRpcPatterns.PREPARE_CHARGE)
  prepareCharge(@Payload() dto: BookingGetRequest): Promise<ChargeContext> {
    return this.bookings.prepareCharge(dto);
  }
}
