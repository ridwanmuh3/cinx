// Shared k6 options: scenarios, thresholds and default executor settings.
//
// Reused by all benchmark scripts so the response-metric thresholds stay
// consistent. Individual scripts may spread this and override scenarios.

// Default latency budgets (milliseconds) for the gateway REST API.
// Tune via env: P95_BUDGET, P99_BUDGET, ERROR_RATE_BUDGET.
const P95_BUDGET = Number(__ENV.P95_BUDGET || 500);
const P99_BUDGET = Number(__ENV.P99_BUDGET || 1000);
const ERROR_RATE_BUDGET = Number(__ENV.ERROR_RATE_BUDGET || 0.01); // <1%

export const thresholds = {
  // Core HTTP health of the run.
  http_req_failed: [`rate<${ERROR_RATE_BUDGET}`],
  http_req_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],

  // Per-operation response metrics (declared in lib.js).
  login_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],
  showtime_list_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],
  seat_map_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],
  booking_hold_duration: [
    `p(95)<${P95_BUDGET + 300}`,
    `p(99)<${P99_BUDGET + 500}`,
  ],
  booking_pay_duration: [
    `p(95)<${P95_BUDGET + 300}`,
    `p(99)<${P99_BUDGET + 500}`,
  ],
  ticket_lookup_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],

  // Booking errors should stay low; contention scenarios relax this per-script.
  hold_errors: ['count<0'],
  pay_errors: ['count<0'],
};

// Default settings shared across scripts.
export const baseOptions = {
  thresholds,
  discardResponseBodies: true,
};
