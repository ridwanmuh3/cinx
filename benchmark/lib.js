// Shared helpers + custom response metrics for the k6 benchmark suite.
//
// Usage (in a scenario script):
//   import { ... } from './lib.js';
//
// Env vars:
//   GATEWAY_URL       base REST URL, default http://localhost:3000/api/v1
//   TOKEN_FILE        JSON produced by scripts/benchmark-users.mjs (optional)
//   CATALOG_FILE      JSON produced by the cinema benchmark seed (optional)
//   DEMO_EMAIL        fallback user prefix when TOKEN_FILE is not set
//   DEMO_PASSWORD     fallback password when TOKEN_FILE is not set
//   DEMO_NAME         fallback display name when TOKEN_FILE is not set
//   THINK_TIME        think time in seconds, default 30
//
// Custom metrics (Trend/Gauge counters) are declared here so every scenario
// reports the same response metrics. Each helper tags its Trend with the
// operation name for easy grouping in the summary output.

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Gauge, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

export const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:3000/api/v1';
export const DEMO_EMAIL = __ENV.DEMO_EMAIL || 'demo-benchmark@example.com';
export const DEMO_PASSWORD = __ENV.DEMO_PASSWORD || 'demo1234';
export const DEMO_NAME = __ENV.DEMO_NAME || 'Benchmark User';
export const THINK_TIME = Number(__ENV.THINK_TIME || 30);

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// ----- Custom response metrics -----
export const metrics = {
  login_duration: new Trend('login_duration', true),
  showtime_list_duration: new Trend('showtime_list_duration', true),
  seat_map_duration: new Trend('seat_map_duration', true),
  booking_hold_duration: new Trend('booking_hold_duration', true),
  booking_pay_duration: new Trend('booking_pay_duration', true),
  booking_poll_duration: new Trend('booking_poll_duration', true),
  booking_cancel_duration: new Trend('booking_cancel_duration', true),
  booking_confirm_duration: new Trend('booking_confirm_duration', true),
  ticket_lookup_duration: new Trend('ticket_lookup_duration', true),
  full_flow_duration: new Trend('full_flow_duration', true),
  hold_error_rate: new Counter('hold_errors'),
  pay_error_rate: new Counter('pay_errors'),
  holds_in_flight: new Gauge('holds_in_flight'),
};

// Pre-provisioned users avoid bcrypt registration/login work inside the
// measured run. The file is generated once by scripts/benchmark-users.mjs.
const TOKEN_FILE = __ENV.TOKEN_FILE || '';
export const tokens = TOKEN_FILE
  ? new SharedArray('benchmark tokens', () => {
      const data = JSON.parse(open(TOKEN_FILE));
      if (Array.isArray(data.tokens)) return data.tokens;
      if (Array.isArray(data.users)) return data.users.map((u) => u.token);
      throw new Error(`TOKEN_FILE ${TOKEN_FILE} has no tokens array`);
    })
  : [];

// The catalog seed writes stable showtime + seat ids so each VU can own a
// unique (showtime, seat) pair instead of racing for the same two seats.
const CATALOG_FILE = __ENV.CATALOG_FILE || '';
export const catalog = CATALOG_FILE
  ? new SharedArray('benchmark catalog', () => {
      const data = JSON.parse(open(CATALOG_FILE));
      if (!Array.isArray(data.showtimes)) {
        throw new Error(`CATALOG_FILE ${CATALOG_FILE} has no showtimes array`);
      }
      return data.showtimes;
    })
  : [];

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

export function jsonBody(obj) {
  return JSON.stringify(obj);
}

export function thinkTime() {
  return THINK_TIME;
}

function record(name, res, expectedStatus) {
  const ok = check(res, {
    [`${name} status ${expectedStatus}`]: (r) => r.status === expectedStatus,
  });
  return ok;
}

// Caches one JWT per VU. When TOKEN_FILE is provided, the pre-provisioned
// token is reused and no auth calls are made during the measured run.
const authCache = {};

export function auth() {
  const cached = authCache[__VU];
  if (cached) {
    return cached;
  }

  if (tokens.length > 0) {
    authCache[__VU] = tokens[(__VU - 1) % tokens.length];
    return authCache[__VU];
  }

  const email = `${DEMO_EMAIL.replace('@', `-${__VU}@`)}`;
  const body = jsonBody({
    email,
    password: DEMO_PASSWORD,
    name: `${DEMO_NAME} ${__VU}`,
  });

  // Registration may fail if the user already exists from a prior run; login
  // is the operation that actually returns a JWT, so always call it.
  http.post(`${BASE_URL}/auth/register`, body, {
    headers: JSON_HEADERS,
  });

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    jsonBody({ email, password: DEMO_PASSWORD }),
    { headers: JSON_HEADERS },
  );
  metrics.login_duration.add(loginRes.timings.duration);
  if (!record('login', loginRes, 200)) {
    fail(`login failed (${loginRes.status}): ${loginRes.body}`);
  }
  authCache[__VU] = loginRes.json('accessToken');
  return authCache[__VU];
}

// Fetches a showtime id from the seeded catalog via the public list endpoint.
export function getShowtimeId() {
  const res = http.get(`${BASE_URL}/showtimes?page=1&limit=5`, {
    headers: JSON_HEADERS,
  });
  metrics.showtime_list_duration.add(res.timings.duration);
  if (!record('showtime list', res, 200)) {
    fail(`showtimes list failed (${res.status}) — run the cinema seed`);
  }
  const items = res.json('items');
  if (!items || items.length === 0) {
    fail('no showtimes in catalog — run the cinema seed');
  }
  return items[0].id;
}

// Fetches the full seat map for a showtime. Used by read-only scenarios where
// a full showtime is still a valid response.
export function getSeatMap(showtimeId) {
  const res = http.get(`${BASE_URL}/showtimes/${showtimeId}/seats`, {
    headers: JSON_HEADERS,
  });
  metrics.seat_map_duration.add(res.timings.duration);
  if (!record('seat map', res, 200)) {
    fail(`seat map failed (${res.status})`);
  }
  return res.json('seats') || [];
}

// Fetches the seat map and returns the ids of two available seats.
export function getAvailableSeatIds(showtimeId) {
  const seats = getSeatMap(showtimeId);
  const available = seats
    .filter((s) => !s.isDisabled && s.status === 'AVAILABLE')
    .slice(0, 2)
    .map((s) => s.id);
  if (available.length < 2) {
    fail(`not enough available seats in showtime ${showtimeId}`);
  }
  return available;
}

// Returns a unique (showtime, seat) pair for this VU from the benchmark
// catalog. Requires CATALOG_FILE; run `pnpm bench:seed:catalog` first.
// `iteration` offsets full-flow VUs so repeated iterations do not reuse a
// seat that is already CONFIRMED.
export function getSeatSlot(iteration = 0, maxVus = 1000, offset = 0) {
  if (catalog.length === 0) {
    fail('CATALOG_FILE is required — run: pnpm bench:seed:catalog');
  }
  const seatsPerShowtime = catalog[0].seatIds.length;
  const totalSlots = catalog.length * seatsPerShowtime;
  const slot = offset + (__VU - 1) + iteration * maxVus;
  if (slot >= totalSlots) {
    fail(`benchmark catalog exhausted at slot ${slot} (${totalSlots} slots)`);
  }
  const showtime = catalog[Math.floor(slot / seatsPerShowtime)];
  const seatId = showtime.seatIds[slot % seatsPerShowtime];
  return { showtimeId: showtime.id, seatIds: [seatId] };
}

// Holds seats and returns the booking id. Records hold latency + errors.
export function holdSeats(token, showtimeId, seatIds) {
  const res = http.post(
    `${BASE_URL}/bookings/holds`,
    jsonBody({ showtimeId, seatIds }),
    { headers: { ...JSON_HEADERS, ...bearer(token) } },
  );
  metrics.booking_hold_duration.add(res.timings.duration);
  if (res.status === 409 || res.status === 410) {
    metrics.hold_error_rate.add(1);
  }
  if (!record('hold', res, 201) && res.status !== 409 && res.status !== 410) {
    fail(`hold failed (${res.status}): ${res.body}`);
  }
  if (res.status !== 201) {
    return undefined;
  }
  return res.json('bookingId') || res.json('id');
}

// Creates a Xendit invoice for a booking and returns the checkout URL.
// With the benchmark mock provider, it settles asynchronously via webhook.
export function payBooking(token, bookingId) {
  const res = http.post(`${BASE_URL}/bookings/${bookingId}/pay`, jsonBody({}), {
    headers: { ...JSON_HEADERS, ...bearer(token) },
  });
  metrics.booking_pay_duration.add(res.timings.duration);
  if (res.status >= 400) {
    metrics.pay_error_rate.add(1);
  }
  if (!record('pay', res, 200)) {
    fail(`pay failed (${res.status}): ${res.body}`);
  }
  return res.json('checkoutUrl');
}

// Reads a booking projection; used to poll the asynchronous saga.
export function getBooking(token, bookingId) {
  const res = http.get(`${BASE_URL}/bookings/${bookingId}`, {
    headers: { ...JSON_HEADERS, ...bearer(token) },
  });
  metrics.booking_poll_duration.add(res.timings.duration);
  if (!record('booking get', res, 200)) {
    fail(`booking get failed (${res.status}): ${res.body}`);
  }
  return res.json();
}

// Polls until the booking is CONFIRMED and its tickets have been issued.
// This is the observable completion point of the payment/booking saga.
export function waitForBookingWithTickets(
  token,
  bookingId,
  timeoutMs = 20000,
  intervalMs = 500,
) {
  const started = Date.now();
  const deadline = started + timeoutMs;
  let latest = null;

  while (Date.now() < deadline) {
    latest = getBooking(token, bookingId);
    const ticketCount = (latest.tickets || []).length;
    if (latest.status === 'CONFIRMED' && ticketCount > 0) {
      metrics.booking_confirm_duration.add(Date.now() - started);
      return latest;
    }
    if (['CANCELLED', 'FAILED', 'EXPIRED'].includes(latest.status)) {
      fail(`booking ${bookingId} ended in ${latest.status}`);
    }
    sleep(intervalMs / 1000);
  }

  fail(
    `booking ${bookingId} did not confirm with tickets within ${timeoutMs}ms ` +
      `(last status: ${latest?.status || 'unknown'})`,
  );
}

export function cancelBooking(token, bookingId) {
  const res = http.post(
    `${BASE_URL}/bookings/${bookingId}/cancel`,
    jsonBody({}),
    { headers: { ...JSON_HEADERS, ...bearer(token) } },
  );
  metrics.booking_cancel_duration.add(res.timings.duration);
  if (!record('cancel', res, 200)) {
    fail(`cancel failed (${res.status}): ${res.body}`);
  }
  return res.json();
}

// Public ticket lookup by code.
export function lookupTicket(code) {
  const res = http.get(`${BASE_URL}/tickets/${code}`, {
    headers: JSON_HEADERS,
  });
  metrics.ticket_lookup_duration.add(res.timings.duration);
  if (!record('ticket lookup', res, 200)) {
    fail(`ticket lookup failed (${res.status}): ${res.body}`);
  }
  return res;
}
