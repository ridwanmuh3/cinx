import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  CinemaServiceStub,
  grpcSend,
  SERVICE_NAMES,
  ShowtimeSeatMap,
  ShowtimeSeat,
} from '@ticketing/shared';

@Injectable()
export class SeatAvailabilityService {
  private readonly cinema: CinemaServiceStub;

  constructor(@Inject(SERVICE_NAMES.CINEMA) client: ClientGrpc) {
    this.cinema = client.getService<CinemaServiceStub>('CinemaService');
  }

  async getSeatMap(showtimeId: string): Promise<ShowtimeSeatMap> {
    return grpcSend(this.cinema.GetSeatMap({ id: showtimeId }));
  }

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
