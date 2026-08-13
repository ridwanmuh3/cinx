import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TicketLookupDto } from '@ticketing/shared';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Public } from '../common/auth/public.decorator';
import { toPositiveInt } from '../utils/paging.util';
import { BookingView, BookingsService } from './bookings.service';
import { HoldSeatsDto } from './dto/hold.dto';
import { PayBookingDto } from './dto/pay.dto';

const MAX_LIMIT = 100;

@Controller()
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('bookings/holds')
  hold(@CurrentUser() user: AuthenticatedUser, @Body() dto: HoldSeatsDto) {
    return this.bookings.hold(user.userId, dto);
  }

  @Get('bookings')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page !== undefined ? toPositiveInt(page, 1, MAX_LIMIT) : 1;
    const l = limit !== undefined ? toPositiveInt(limit, 1, MAX_LIMIT) : 20;
    return this.bookings.list(user.userId, p, l);
  }

  @Get('bookings/:id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BookingView> {
    return this.bookings.get(user.userId, id);
  }

  @Post('bookings/:id/pay')
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PayBookingDto,
  ): Promise<BookingView> {
    return this.bookings.pay(user.userId, id, dto);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BookingView> {
    return this.bookings.cancel(user.userId, id);
  }

  @Public()
  @Get('tickets/:code')
  getTicketByCode(@Param('code') code: string): Promise<TicketLookupDto> {
    return this.bookings.getTicketByCode(code);
  }
}
