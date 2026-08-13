// Load test: ramps VUs up to a steady target, holds, then ramps back down.
// Measures steady-state throughput and latency across the full booking flow.
//
//   k6 run benchmark/load.js
//   VUS=50 k6 run benchmark/load.js

import { sleep } from 'k6';
import { baseOptions } from './options.js';
import {
  auth,
  getShowtimeId,
  getAvailableSeatIds,
  holdSeats,
  payBooking,
  lookupTicket,
} from './lib.js';

const TARGET_VUS = Number(__ENV.VUS || 50);

export const options = {
  ...baseOptions,
  scenarios: {
    load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: TARGET_VUS }, // warm-up
        { duration: '5m', target: TARGET_VUS }, // steady state
        { duration: '1m', target: 0 }, // ramp-down
      ],
    },
  },
};

export default function () {
  const token = auth();
  const showtimeId = getShowtimeId();
  const seatIds = getAvailableSeatIds(showtimeId);

  const bookingId = holdSeats(token, showtimeId, seatIds);
  const codes = payBooking(token, bookingId);
  for (const code of codes) {
    lookupTicket(code);
  }

  sleep(1);
}
