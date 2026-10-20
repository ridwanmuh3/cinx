// Open-loop read test: fixed request arrival rate instead of closed-loop VUs.
//
// Closed-loop VUs slow down when the system slows down, which hides tail
// latency (coordinated omission). This scenario keeps the arrival rate fixed
// so p95/p99 reflect the latency a real traffic mix would see.
//
//   RATE=50 DURATION=10m k6 run benchmark/open-loop-read.js

import { baseOptions } from './options.js';
import { getSeatMap, getShowtimeId } from './lib.js';

const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '10m';
const PRE_VUS = Number(__ENV.PRE_VUS || 50);
const MAX_VUS = Number(__ENV.MAX_VUS || 1000);

export const options = {
  ...baseOptions,
  scenarios: {
    readArrival: {
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
  const showtimeId = getShowtimeId();
  getSeatMap(showtimeId);
}
