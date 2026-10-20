// Availability probe: fixed-rate health + catalog reads.
//
// Run this while restarting a dependency (Postgres, Redis, RabbitMQ, or one
// service) to observe the outage window and recovery time. It measures the
// gateway's availability, not HA failover: local Compose has single-instance
// dependencies, so an outage is expected to be visible.
//
//   RATE=5 DURATION=10m k6 run benchmark/availability.js

import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';
import { baseOptions } from './options.js';
import { BASE_URL } from './lib.js';

const RATE = Number(__ENV.RATE || 5);
const DURATION = __ENV.DURATION || '10m';
const PRE_VUS = Number(__ENV.PRE_VUS || 10);
const MAX_VUS = Number(__ENV.MAX_VUS || 50);
const PROBE_ERROR_BUDGET = Number(__ENV.PROBE_ERROR_BUDGET || 0);

const probeDuration = new Trend('availability_probe_duration', true);
const probeErrors = new Counter('availability_probe_errors');

export const options = {
  ...baseOptions,
  thresholds: {
    ...baseOptions.thresholds,
    availability_probe_errors: [`count<=${PROBE_ERROR_BUDGET}`],
  },
  scenarios: {
    availability: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_VUS,
      maxVUs: MAX_VUS,
    },
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  probeDuration.add(health.timings.duration);
  if (health.status !== 200) {
    probeErrors.add(1);
  }

  const showtimes = http.get(`${BASE_URL}/showtimes?page=1&limit=1`);
  probeDuration.add(showtimes.timings.duration);
  if (showtimes.status !== 200) {
    probeErrors.add(1);
  }
}
