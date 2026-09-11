# k6 Benchmarks

[k6](https://k6.io) load tests against the REST gateway. Run them with the
stack up (see root `README.md` → Quick start / Docker).

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) on your `PATH`
  (tested with v2.2.0).
- A live, seeded stack:
  - `pnpm docker:up && pnpm docker:seed`, **or**
  - `pnpm infra:up` + seed services + `pnpm dev`

## Running

```bash
pnpm bench:smoke        # 1 VU sanity check — run this first
pnpm bench:load         # ramp to N VUs, hold, ramp down (default 50)
pnpm bench:stress       # aggressive ramp to find the breaking point (default 300)
pnpm bench:soak         # sustained load to catch leaks/TTL drift (default 30 VUs / 30m)
pnpm bench:contention   # concurrent VUs on the same seat -> redlock 409/410
```

### Env vars

| Variable            | Default                        | Used by                     |
| ------------------- | ------------------------------ | --------------------------- |
| `GATEWAY_URL`       | `http://localhost:3000/api/v1` | all                         |
| `DEMO_EMAIL`        | `demo-benchmark@example.com`   | all (per-VU suffix)         |
| `DEMO_PASSWORD`     | `demo1234`                     | all                         |
| `DEMO_NAME`         | `Benchmark User`               | all                         |
| `VUS`               | scenario default               | load/stress/soak/contention |
| `DURATION`          | `30m`                          | soak                        |
| `P95_BUDGET`        | `500` (ms)                     | thresholds (all)            |
| `P99_BUDGET`        | `1000` (ms)                    | thresholds (all)            |
| `ERROR_RATE_BUDGET` | `0.01`                         | thresholds (all)            |

Examples:

```bash
VUS=100 pnpm bench:load
GATEWAY_URL=http://127.0.0.1:3000/api/v1 VUS=30 DURATION=1h pnpm bench:soak
```

## Metrics

Built-in k6 metrics are reported as usual (`http_req_duration`,
`http_req_failed`, `http_reqs`, …) plus per-operation **Trend** response
metrics and **Counter** error metrics from `lib.js`:

| Metric                   | Type    | Meaning                                  |
| ------------------------ | ------- | ---------------------------------------- |
| `login_duration`         | Trend   | POST /auth/login latency                 |
| `showtime_list_duration` | Trend   | GET /showtimes latency                   |
| `seat_map_duration`      | Trend   | GET /showtimes/:id/seats latency         |
| `booking_hold_duration`  | Trend   | POST /bookings/holds latency             |
| `booking_pay_duration`   | Trend   | POST /bookings/:id/pay latency           |
| `ticket_lookup_duration` | Trend   | GET /tickets/:code latency               |
| `hold_errors`            | Counter | holds that returned 409/410 (contention) |
| `pay_errors`             | Counter | pays that returned >= 400                |

### Thresholds (`options.js`)

- `http_req_failed` < 1%
- `http_req_duration` p95 < 500ms, p99 < 1000ms
- per-op Trends within the same latency budget (holds/pays get +300/+500ms
  headroom because they traverse TCP + Redis + Postgres)
- `hold_errors` / `pay_errors` must be 0 in load/stress/soak/smoke

The **contention** scenario relaxes the zero-error budget for `hold_errors`,
because 409/410 are the _expected_ outcome when many VUs race for one seat.

## Notes

- Each VU authenticates with a unique `DEMO_EMAIL` (a `-<VU>` suffix is
  injected) so holds are isolated and redlock contention is the only shared
  resource.
- Run `bench:smoke` against a fresh stack before trusting the heavier
  scenarios.
- Output is the standard k6 summary. Add `--out json=benchmark/results.json`
  to export for dashboards, or pair with the k6 dashboard via
  `k6 run --out web-dashboard=...`.
