// Read-only load test: public catalog + seat-map reads.
//
// This is the cleanest scalability signal: no auth, no seat inventory, no
// external payment provider. Use it to find the gateway/cinema-service knee,
// then compare with the write-heavy hold and full-flow scenarios.
//
//   VUS=100 THINK_TIME=30 k6 run benchmark/read.js
//   VUS=1000 THINK_TIME=30 k6 run benchmark/read.js

import { sleep } from 'k6';
import { baseOptions } from './options.js';
import { getSeatMap, getShowtimeId, thinkTime } from './lib.js';

const TARGET_VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '10m';
const RAMP_DURATION = __ENV.RAMP_DURATION || '3m';
const RAMP_DOWN_DURATION = __ENV.RAMP_DOWN_DURATION || '2m';

export const options = {
  ...baseOptions,
  scenarios: {
    read: {
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
  const showtimeId = getShowtimeId();
  getSeatMap(showtimeId);
  sleep(thinkTime());
}
