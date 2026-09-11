import {
  Body,
  Controller,
  Get,
  Headers,
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
import { BookingView, BookingsService, PayResult } from './bookings.service';
import { HoldSeatsDto } from './dto/hold.dto';
import { PayBookingDto, XenditWebhookDto } from './dto/pay.dto';

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
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PayBookingDto,
  ): Promise<PayResult> {
    return this.bookings.pay(user.userId, id, dto);
  }

  /**
   * Xendit invoice callback. Authenticated via the `x-callback-token`
   * header (not JWT), verified in ticket-service against
   * XENDIT_WEBHOOK_TOKEN. Configure this URL in the Xendit dashboard.
   */
  @Public()
  @Post('payments/xendit/webhook')
  @HttpCode(200)
  xenditWebhook(
    @Headers('x-callback-token') signature: string,
    @Body() body: XenditWebhookDto,
  ) {
    return this.bookings.webhook(signature ?? '', JSON.stringify(body ?? {}));
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
