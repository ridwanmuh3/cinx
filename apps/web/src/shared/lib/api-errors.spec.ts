import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { describeApiError } from './api-errors';

describe('describeApiError', () => {
  it('translates network failures into actionable copy', () => {
    const message = describeApiError(new TypeError('Failed to fetch'));
    expect(message).toMatch(/could not reach the cinema network/i);
  });

  it('speaks truthfully about a lost seat conflict (409)', () => {
    const message = describeApiError(new ApiError('Seats already held', 409));
    expect(message).toMatch(/just a step ahead/i);
  });

  it('explains hold expiry (410) with the next step', () => {
    const message = describeApiError(new ApiError('Hold expired', 410));
    expect(message).toMatch(/hold expired.*pick your seats again/i);
  });

  it('tells the truth about server failures (5xx)', () => {
    const message = describeApiError(new ApiError('Internal server error', 500));
    expect(message).toMatch(/on our side/i);
  });

  it('passes through field-level validation messages (422)', () => {
    const message = describeApiError(new ApiError('Password must be 8–72 characters.', 422));
    expect(message).toBe('Password must be 8–72 characters.');
  });

  it('falls back for non-Error values', () => {
    expect(describeApiError(undefined)).toMatch(/something went wrong/i);
    expect(describeApiError('nope')).toMatch(/something went wrong/i);
  });

  it('hides our generic transport string behind the fallback', () => {
    const message = describeApiError(new ApiError('Request failed (502)', 502));
    expect(message).toMatch(/on our side/i);
  });
});
