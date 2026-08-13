// Soak test: long-running moderate load to surface memory leaks, connection
// exhaustion, and slow seat-lock TTL / reconciliation behaviour over time.
//
//   k6 run benchmark/soak.js
//   VUS=30 DURATION=1h k6 run benchmark/soak.js

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

const VUS = Number(__ENV.VUS || 30);
const DURATION = __ENV.DURATION || '30m';

export const options = {
  ...baseOptions,
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5m', target: VUS }, // warm-up
        { duration: DURATION, target: VUS }, // sustained load
        { duration: '5m', target: 0 }, // cool-down
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
