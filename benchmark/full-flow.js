// Mixed load: hold + cancel normally; every ~12th iteration completes
// hold -> pay (mock Xendit) -> webhook -> CONFIRMED -> ticket lookup.
// Per-VU phase spreads paid operations across the steady-state window.
// Paid seats never repeat; one separate seat per VU is reused after cancel.
//
//   TOKEN_FILE=... CATALOG_FILE=... VUS=1000 THINK_TIME=30 \
//     k6 run benchmark/full-flow.js

import { fail, sleep } from 'k6';
import { baseOptions } from './options.js';
import {
  auth,
  cancelBooking,
  catalog,
  getSeatSlot,
  holdSeats,
  lookupTicket,
  metrics,
  payBooking,
  waitForBookingWithTickets,
  thinkTime,
} from './lib.js';

const TARGET_VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '10m';
const RAMP_DURATION = __ENV.RAMP_DURATION || '3m';
const RAMP_DOWN_DURATION = __ENV.RAMP_DOWN_DURATION || '2m';
const PAY_EVERY = Number(__ENV.PAY_EVERY || 12);
const CONFIRM_TIMEOUT_MS = Number(__ENV.CONFIRM_TIMEOUT_MS || 20000);
const totalSlots = catalog.length * (catalog[0]?.seatIds.length || 0);
// ponytail: one catalog per run; add per-run catalog partitioning if runs overlap.
const holdSlot = (Math.floor(totalSlots / TARGET_VUS) - 1) * TARGET_VUS;

export const options = {
  ...baseOptions,
  scenarios: {
    fullFlow: {
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
  const started = Date.now();
  const token = auth();
  if (!Number.isSafeInteger(PAY_EVERY) || PAY_EVERY < 1 || holdSlot < 0) {
    fail('PAY_EVERY must be positive and catalog needs more slots than VUs');
  }
  const phase = (__VU - 1) % PAY_EVERY;
  const pay = (__ITER + phase) % PAY_EVERY === 0;
  const paidGroup = Math.floor((__ITER + phase) / PAY_EVERY);
  if (pay && paidGroup * TARGET_VUS >= holdSlot) {
    fail('benchmark catalog exhausted — add showtimes or reduce run duration');
  }
  const { showtimeId, seatIds } = getSeatSlot(
    0,
    TARGET_VUS,
    pay ? paidGroup * TARGET_VUS : holdSlot,
  );

  const bookingId = holdSeats(token, showtimeId, seatIds);
  if (!bookingId) {
    fail(`hold did not return a booking for ${showtimeId}/${seatIds[0]}`);
  }

  if (pay) {
    payBooking(token, bookingId);
    const booking = waitForBookingWithTickets(
      token,
      bookingId,
      CONFIRM_TIMEOUT_MS,
    );
    const ticketCode = booking.tickets?.[0]?.code;
    if (!ticketCode) fail(`booking ${bookingId} has no ticket code`);
    lookupTicket(ticketCode);
    metrics.full_flow_duration.add(Date.now() - started);
  } else {
    cancelBooking(token, bookingId);
  }

  sleep(thinkTime());
}
