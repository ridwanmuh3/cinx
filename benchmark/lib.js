// Shared helpers + custom response metrics for the k6 benchmark suite.
//
// Usage (in a scenario script):
//   import { ... } from './lib.js';
//
// Env vars:
//   GATEWAY_URL       base REST URL, default http://localhost:3000/api/v1
//   DEMO_EMAIL        user to authenticate as (default: seeded demo user)
//   DEMO_PASSWORD     password for DEMO_EMAIL
//   DEMO_NAME         display name used when registering
//
// Custom metrics (Trend/Gauge counters) are declared here so every scenario
// reports the same response metrics. Each helper tags its Trend with the
// operation name for easy grouping in the summary output.

import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Gauge, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:3000/api/v1';
export const DEMO_EMAIL = __ENV.DEMO_EMAIL || 'demo-benchmark@example.com';
export const DEMO_PASSWORD = __ENV.DEMO_PASSWORD || 'demo1234';
export const DEMO_NAME = __ENV.DEMO_NAME || 'Benchmark User';

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
  ticket_lookup_duration: new Trend('ticket_lookup_duration', true),
  hold_error_rate: new Counter('hold_errors'),
  pay_error_rate: new Counter('pay_errors'),
  holds_in_flight: new Gauge('holds_in_flight'),
};

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

export function jsonBody(obj) {
  return JSON.stringify(obj);
}

function record(name, res, expectedStatus) {
  const ok = check(res, {
    [`${name} status ${expectedStatus}`]: (r) => r.status === expectedStatus,
  });
  return ok;
}

// Caches one JWT per VU so later iterations reuse the token instead of
// re-registering (which returns 422 on repeat and inflates http_req_failed).
const authCache = {};

// Registers or logs in, returning a JWT. Uses unique email per VU so that
// holds are isolated between virtual users.
export function auth() {
  const cached = authCache[__VU];
  if (cached) {
    return cached;
  }

  const email = `${DEMO_EMAIL.replace('@', `-${__VU}@`)}`;
  const body = jsonBody({
    email,
    password: DEMO_PASSWORD,
    name: `${DEMO_NAME} ${__VU}`,
  });

  const register = http.post(`${BASE_URL}/auth/register`, body, {
    headers: JSON_HEADERS,
  });

  // Registration may fail if the user already exists from a prior run — login.
  if (register.status !== 201 && register.status !== 200) {
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

  authCache[__VU] = register.json('accessToken');
  return authCache[__VU];
}

// Fetches a showtime id from the seeded catalog.
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

// Fetches the seat map for a showtime and returns the ids of two available seats.
export function getAvailableSeatIds(showtimeId) {
  const res = http.get(`${BASE_URL}/showtimes/${showtimeId}/seats`, {
    headers: JSON_HEADERS,
  });
  metrics.seat_map_duration.add(res.timings.duration);
  if (!record('seat map', res, 200)) {
    fail(`seat map failed (${res.status})`);
  }
  const seats = res.json('seats') || [];
  const available = seats
    .filter((s) => !s.isDisabled && s.status === 'AVAILABLE')
    .slice(0, 2)
    .map((s) => s.id);
  if (available.length < 2) {
    fail(`not enough available seats in showtime ${showtimeId}`);
  }
  return available;
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
  return res.json('bookingId') || res.json('id');
}

// Creates a Xendit invoice for a booking. Returns the checkout URL
// (the booking stays PENDING until the Xendit webhook confirms it, so
// there are no ticket codes to return at this stage).
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

// Public ticket lookup by code.
export function lookupTicket(code) {
  const res = http.get(`${BASE_URL}/tickets/${code}`, {
    headers: JSON_HEADERS,
  });
  metrics.ticket_lookup_duration.add(res.timings.duration);
  record('ticket lookup', res, 200);
  return res;
}
