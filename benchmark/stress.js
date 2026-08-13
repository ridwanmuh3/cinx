// Stress test: aggressive ramp past a realistic ceiling to find the breaking
// point (degrading latency, rising errors) of the gateway + TCP services.
//
//   k6 run benchmark/stress.js
//   VUS=500 k6 run benchmark/stress.js

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

const PEAK_VUS = Number(__ENV.VUS || 300);

export const options = {
  ...baseOptions,
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: Math.floor(PEAK_VUS / 4) },
        { duration: '1m', target: Math.floor(PEAK_VUS / 2) },
        { duration: '1m', target: PEAK_VUS },
        { duration: '2m', target: PEAK_VUS },
        { duration: '1m', target: 0 },
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
