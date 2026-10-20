import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import {
  injectTraceHeaders,
  TicketEvents,
  TicketsIssuedData,
  TicketsVoidedData,
} from '@ticketing/shared';

export const TICKET_EVENTS_CLIENT = 'TICKET_EVENTS_CLIENT';

@Injectable()
export class TicketEventsPublisher {
  constructor(
    @Inject(TICKET_EVENTS_CLIENT) private readonly client: ClientProxy,
  ) {}

  issued(data: TicketsIssuedData): Promise<void> {
    return this.publish(TicketEvents.ISSUED, data);
  }

  voided(data: TicketsVoidedData): Promise<void> {
    return this.publish(TicketEvents.VOIDED, data);
  }

  private async publish(pattern: string, payload: object): Promise<void> {
    const record = new RmqRecordBuilder(payload)
      .setOptions({ headers: injectTraceHeaders() })
      .build();

    await new Promise<void>((resolve, reject) => {
      this.client.emit(pattern, record).subscribe({
        error: (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        complete: () => resolve(),
      });
    });
  }
}
