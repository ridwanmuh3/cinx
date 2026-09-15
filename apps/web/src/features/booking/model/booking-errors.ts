import { ApiError } from '@/shared/api';
import type { SeatMap } from '@/shared/api/types';

export interface SeatConflict {
  /** Seat ids the server reports as taken by someone else. */
  conflictSeatIds: string[];
  /** Human, actionable copy naming the lost seats. */
  message: string;
}

/**
 * Detects a 409 seat conflict on a failed hold and turns the server's
 * `conflictSeatIds` into a truthful, human message ("B7, B8 were just taken…").
 * Returns null for every other failure shape — callers fall back to the
 * generic mapper. Conflict ids are also returned so the seat map can
 * highlight exactly which seats vanished.
 */
export function seatConflictFromError(err: unknown, seatMap: SeatMap | null): SeatConflict | null {
  if (!(err instanceof ApiError) || err.statusCode !== 409) return null;

  const conflictSeatIds = err.conflictSeatIds ?? [];
  if (conflictSeatIds.length === 0) {
    return {
      conflictSeatIds: [],
      message:
        'Those seats were just taken by someone else. The map below is now up to date — please pick different seats.',
    };
  }

  const labels = conflictSeatIds
    .map((seatId) => {
      const seat = seatMap?.seats.find((s) => s.id === seatId);
      return seat ? `${seat.row}${seat.number}` : null;
    })
    .filter((label): label is string => label !== null);

  const seatList = labels.length > 0 ? labels.join(', ') : 'Those seats';
  const verb = labels.length === 1 ? 'was' : 'were';
  return {
    conflictSeatIds,
    message: `${seatList} ${verb} just taken while you were choosing. The map below is now up to date — please pick different seats.`,
  };
}
