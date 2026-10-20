// Shared k6 options: scenarios, thresholds and default executor settings.
//
// Reused by all benchmark scripts so the response-metric thresholds stay
// consistent. Individual scripts may spread this and override scenarios.

import http from 'k6/http';

// Treat 2xx/3xx plus expected domain outcomes as expected responses so
// http_req_failed only counts genuine infra/server failures. Seat contention
// (409), expired holds (410), and unknown tickets (404) are valid domain
// outcomes in their respective scenarios;
// those scripts assert their own error counters on top of this.
http.setResponseCallback(
  http.expectedStatuses(200, 201, 202, 204, 404, 409, 410, 422),
);

// Default latency budgets (milliseconds) for the gateway REST API.
// Tune via env: P50_BUDGET, P95_BUDGET, P99_BUDGET, P999_BUDGET,
// ERROR_RATE_BUDGET.
const P50_BUDGET = Number(__ENV.P50_BUDGET || 250);
const P95_BUDGET = Number(__ENV.P95_BUDGET || 500);
const P99_BUDGET = Number(__ENV.P99_BUDGET || 1000);
const P999_BUDGET = Number(__ENV.P999_BUDGET || 2000);
const ERROR_RATE_BUDGET = Number(__ENV.ERROR_RATE_BUDGET || 0.01); // <1%

export const thresholds = {
  // Core HTTP health of the run.
  http_req_failed: [`rate<${ERROR_RATE_BUDGET}`],
  http_req_duration: [
    `p(50)<${P50_BUDGET}`,
    `p(95)<${P95_BUDGET}`,
    `p(99)<${P99_BUDGET}`,
    `p(99.9)<${P999_BUDGET}`,
  ],

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
  booking_poll_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],
  booking_cancel_duration: [
    `p(95)<${P95_BUDGET + 300}`,
    `p(99)<${P99_BUDGET + 500}`,
  ],
  booking_confirm_duration: [
    `p(95)<${P95_BUDGET + 3000}`,
    `p(99)<${P99_BUDGET + 5000}`,
  ],
  ticket_lookup_duration: [`p(95)<${P95_BUDGET}`, `p(99)<${P99_BUDGET}`],
  full_flow_duration: [
    `p(95)<${P95_BUDGET + 4000}`,
    `p(99)<${P99_BUDGET + 7000}`,
  ],

  // Booking errors should stay low; contention scenarios relax this per-script.
  hold_errors: ['count==0'],
  pay_errors: ['count==0'],
};

// Default settings shared across scripts.
export const baseOptions = {
  thresholds,
  summaryTrendStats: [
    'avg',
    'min',
    'med',
    'max',
    'p(50)',
    'p(95)',
    'p(99)',
    'p(99.9)',
  ],
};
