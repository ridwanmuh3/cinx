import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  grpcSend,
  SERVICE_NAMES,
  UserContactDto,
  UserServiceStub,
} from '@ticketing/shared';

/**
 * Resolves the customer behind a Booking.
 *
 * ticket-service owns Bookings but not people: `userId` is a logical
 * reference, and the email/name needed to notify someone live in user_db.
 * This asks user-service for just that contact slice instead of duplicating
 * customer data into ticket_db.
 */
@Injectable()
export class CustomerDirectoryService {
  private readonly logger = new Logger(CustomerDirectoryService.name);
  private readonly users: UserServiceStub;

  constructor(@Inject(SERVICE_NAMES.USER) client: ClientGrpc) {
    this.users = client.getService<UserServiceStub>('UserService');
  }

  /**
   * The customer's contact details, or null when they cannot be resolved.
   * Never throws: a missing contact must degrade to "no email", not to a
   * failed booking.
   */
  async contactFor(userId: string): Promise<UserContactDto | null> {
    try {
      return await grpcSend<UserContactDto>(this.users.Get({ userId }));
    } catch (err) {
      this.logger.warn(
        `could not resolve contact for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
