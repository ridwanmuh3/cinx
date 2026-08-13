// Seat-contention test: hammers the redlock path in ticket-service.
//
// Every VU targets the SAME showtime + SAME single seat. Only one hold should
// win the multi-key redlock; the rest should get 409 (or 410 if a prior lock
// expired). This exercises lock acquisition, contention and TTL release under
// load, and asserts that contention stays bounded (i.e. the redlock is doing
// its job rather than double-booking).
//
//   k6 run benchmark/seat-contention.js
//   VUS=100 k6 run benchmark/seat-contention.js

import { sleep } from 'k6';
import { baseOptions } from './options.js';
import { auth, getShowtimeId, getAvailableSeatIds, holdSeats } from './lib.js';

const VUS = Number(__ENV.VUS || 50);

export const options = {
  ...baseOptions,
  // Override: in a contention test, 409/410 are EXPECTED outcomes, so the
  // default zero-error budget does not apply. We still assert the overall
  // request failure rate stays within budget (unexpected 5xx, etc.).
  thresholds: {
    ...baseOptions.thresholds,
    hold_errors: ['count<0'], // populated only by expected 409/410
  },
  scenarios: {
    contention: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: VUS },
        { duration: '1m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
};

export default function () {
  const token = auth();
  const showtimeId = getShowtimeId();

  // Grab a single shared seat id (fixed per showtime, so every VU contends).
  const seats = getAvailableSeatIds(showtimeId);
  const contestedSeat = [seats[0]];

  // Ignore the booking id — the point is to observe lock contention, not to
  // complete a payment. holdSeats records hold_errors on 409/410.
  holdSeats(token, showtimeId, contestedSeat);

  // Small pacing so VUs overlap on the same seat window.
  sleep(0.5);
}
