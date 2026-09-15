import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { seatConflictFromError } from './booking-errors';
import type { SeatMap } from '@/shared/api/types';

const seatMap: SeatMap = {
  showtimeId: 'st-1',
  price: { amount: 50000, currency: 'IDR' },
  seats: [
    { id: 's1', row: 'A', number: 1, category: 'REGULAR', isAccessible: false, isDisabled: false, status: 'AVAILABLE' },
    { id: 's2', row: 'B', number: 7, category: 'REGULAR', isAccessible: false, isDisabled: false, status: 'AVAILABLE' },
    { id: 's3', row: 'B', number: 8, category: 'VIP', isAccessible: false, isDisabled: false, status: 'AVAILABLE' },
  ],
};

describe('seatConflictFromError', () => {
  it('returns null for non-409 failures', () => {
    expect(seatConflictFromError(new ApiError('boom', 500), seatMap)).toBeNull();
    expect(seatConflictFromError(new Error('boom'), seatMap)).toBeNull();
    expect(seatConflictFromError(null, seatMap)).toBeNull();
  });

  it('names the seats lost to a 409 conflict', () => {
    const conflict = seatConflictFromError(new ApiError('held', 409, ['s2', 's3']), seatMap);
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictSeatIds).toEqual(['s2', 's3']);
    expect(conflict!.message).toContain('B7, B8');
  });

  it('still tells the truth when the server sends no ids', () => {
    const conflict = seatConflictFromError(new ApiError('held', 409), seatMap);
    expect(conflict!.conflictSeatIds).toEqual([]);
    expect(conflict!.message).toMatch(/just taken by someone else/i);
  });

  it('handles unknown seat ids gracefully', () => {
    const conflict = seatConflictFromError(new ApiError('held', 409, ['ghost']), seatMap);
    expect(conflict!.conflictSeatIds).toEqual(['ghost']);
    expect(conflict!.message).toMatch(/those seats were just taken/i);
  });
});
