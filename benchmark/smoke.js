// Smoke test: 1 VU running a handful of iterations to sanity-check that the
// whole user flow works end-to-end against a live stack. Use this first when
// the stack is up but before running heavier scenarios.
//
//   k6 run benchmark/smoke.js

import { sleep } from 'k6';
import { baseOptions } from './options.js';
import {
  BASE_URL,
  auth,
  getShowtimeId,
  getAvailableSeatIds,
  holdSeats,
  payBooking,
} from './lib.js';

export const options = {
  ...baseOptions,
  scenarios: {
    smoke: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 3,
      maxDuration: '2m',
    },
  },
};

export default function () {
  const token = auth();
  const showtimeId = getShowtimeId();
  const seatIds = getAvailableSeatIds(showtimeId);

  const bookingId = holdSeats(token, showtimeId, seatIds);
  payBooking(token, bookingId);

  sleep(1);
}

// Keep the import referenced for lint tooling even when scenarios are trimmed.
void BASE_URL;
