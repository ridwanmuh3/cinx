import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  CinemaPatterns,
  SERVICE_NAMES,
  ShowtimeSeatMap,
  ShowtimeSeat,
} from '@ticketing/shared';

/**
 * Validates seat/showtime state by querying cinema-service over TCP.
 * ticket-service does NOT own seat geometry; it only owns availability
 * state (held/booked) via Redis locks. Seat snapshots are captured at
 * hold time so a deleted theater or changed seat layout cannot corrupt
 * an existing booking.
 */
@Injectable()
export class SeatAvailabilityService {
  constructor(
    @Inject(SERVICE_NAMES.CINEMA) private readonly cinemaClient: ClientProxy,
  ) {}

  /** Fetch the seat map for a showtime. Throws on missing showtime. */
  async getSeatMap(showtimeId: string): Promise<ShowtimeSeatMap> {
    return firstValueFrom(
      this.cinemaClient.send<ShowtimeSeatMap>(CinemaPatterns.SHOWTIME_SEATS, {
        id: showtimeId,
      }),
    );
  }

  /**
   * Validate that all requested seatIds exist on the showtime's seat map
   * and are not disabled. Returns the matching seat definitions plus the
   * full seat map (pricing/movie/theater info) in a single trip.
   * Throws if any seat is unknown/disabled or the showtime doesn't exist.
   */
  async validateSeats(
    showtimeId: string,
    seatIds: string[],
  ): Promise<{ seats: ShowtimeSeat[]; seatMap: ShowtimeSeatMap }> {
    const seatMap = await this.getSeatMap(showtimeId);
    const requested = new Set(seatIds);
    const found = seatMap.seats.filter(
      (s) => !s.isDisabled && requested.has(s.id),
    );

    const foundIds = new Set(found.map((s) => s.id));
    for (const sid of seatIds) {
      if (!foundIds.has(sid)) {
        const disabled = seatMap.seats.find((s) => s.id === sid);
        throw new Error(
          disabled && disabled.isDisabled
            ? `Seat ${sid} is disabled`
            : `Seat ${sid} does not exist for showtime ${showtimeId}`,
        );
      }
    }

    return { seats: found, seatMap };
  }
}
