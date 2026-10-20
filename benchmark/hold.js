// Hold load test: unique seat per VU, hold then cancel.
//
// Cancelling each hold releases the seat again, so a 10-minute run does not
// need tens of thousands of pre-seeded seats. This exercises the booking
// write path, Redis lock, Postgres transaction and cancellation path without
// touching Xendit.
//
//   TOKEN_FILE=... CATALOG_FILE=... VUS=1000 THINK_TIME=30 \
//     k6 run benchmark/hold.js

import { sleep } from 'k6';
import { baseOptions } from './options.js';
import {
  auth,
  cancelBooking,
  getSeatSlot,
  holdSeats,
  thinkTime,
} from './lib.js';

const TARGET_VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '10m';
const RAMP_DURATION = __ENV.RAMP_DURATION || '3m';
const RAMP_DOWN_DURATION = __ENV.RAMP_DOWN_DURATION || '2m';

export const options = {
  ...baseOptions,
  scenarios: {
    hold: {
      executor: 'ramping-vus',
      stages: [
        { duration: RAMP_DURATION, target: TARGET_VUS },
        { duration: DURATION, target: TARGET_VUS },
        { duration: RAMP_DOWN_DURATION, target: 0 },
      ],
    },
  },
};

export default function () {
  const token = auth();
  const { showtimeId, seatIds } = getSeatSlot();
  const bookingId = holdSeats(token, showtimeId, seatIds);

  if (bookingId) {
    cancelBooking(token, bookingId);
  }

  sleep(thinkTime());
}
