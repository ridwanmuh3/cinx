import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  PaymentChargeRequest,
  PaymentChargeResponse,
  PaymentDto,
  PaymentRpcPatterns,
  PaymentSyncRequest,
  PaymentWebhookRequest,
} from '@ticketing/shared';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @GrpcMethod('PaymentService', PaymentRpcPatterns.CHARGE)
  charge(dto: PaymentChargeRequest): Promise<PaymentChargeResponse> {
    return this.payments.charge(dto);
  }

  /**
   * Xendit callback. The gateway proxies the callback token and raw body; the
   * provider signature is verified here, in the service that owns the
   * provider integration.
   */
  @GrpcMethod('PaymentService', PaymentRpcPatterns.WEBHOOK)
  async webhook(dto: PaymentWebhookRequest): Promise<Record<string, never>> {
    return this.payments.webhook(dto);
  }

  /** Server-side sync when the browser returns before the webhook arrives. */
  @GrpcMethod('PaymentService', PaymentRpcPatterns.SYNC)
  syncPaymentStatus(dto: PaymentSyncRequest): Promise<PaymentDto> {
    return this.payments.syncPaymentStatus(dto);
  }

  @GrpcMethod('PaymentService', PaymentRpcPatterns.GET)
  get(dto: { bookingId: string }): Promise<PaymentDto> {
    return this.payments.get(dto.bookingId);
  }
}
