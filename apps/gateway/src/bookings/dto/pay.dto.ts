import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Xendit POSTs a flat JSON invoice callback. It must reach
 * ticket-service (the callback token covers the body), so this DTO
 * whitelists only the fields we consume — `forbidNonWhitelisted` would
 * otherwise 400 every real callback before signature verification runs.
 * Fields are re-parsed defensively in ticket-service
 * (PaymentService.parseCallback), which is the trust boundary.
 */
export class XenditWebhookDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() external_id?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paid_at?: string;
  @IsOptional() @IsString() payment_method?: string;
  @IsOptional() @IsString() payment_channel?: string;
  @IsOptional() paid_amount?: number;
  @IsOptional() amount?: number;
}

/**
 * After payment, Xendit redirects the browser here. Accepted shapes:
 * a relative path (`/bookings/confirm/x`) or an absolute http(s) URL.
 * ticket-service normalises absolute URLs to their path portion, so the
 * redirect can never leave the site (no open redirect / phishing hop).
 */
export class PayBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(\/(?!\/)[^\s"\\]*|https?:\/\/[^\s"\\]+)$/i, {
    message: 'returnUrl must be a relative path or http(s) URL',
  })
  returnUrl?: string;

  @IsOptional()
  @IsEmail()
  payerEmail?: string;
}
