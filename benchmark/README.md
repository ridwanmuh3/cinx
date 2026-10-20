# k6 Benchmarks

Load, stress, and reliability tests against the REST gateway with k6. The
suite reports p50/p95/p99/p99.9 response times, throughput, and domain error
counters, and is set up for the 100 / 500 / 1,000 closed-loop VU levels.

## Why a mock Xendit provider?

Xendit limits invoice/refund endpoints to roughly **60 RPM per endpoint per
account in test mode** and **600 RPM in live mode** ([rate limits
docs](https://docs.xendit.co/apidocs/rate-limits)). At 500 VUs a mixed flow
already exceeds the test-mode limit, and using a production account for load
tests is both unsafe and non-reproducible.

The benchmark therefore points payment-service at a local mock:

- no third-party quota, cost, or account pollution;
- deterministic settlement via a real HTTP webhook;
- the actual payment-service `XenditProvider` and webhook path are exercised;
- failure injection (`429`, `500`, duplicate webhook) remains available.

Never use real Xendit credentials for these runs.

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) v2.x on `PATH`.
- A running stack. Either local (`pnpm dev`) or the full Docker stack.
- The gateway rate limiter must be disabled for the benchmark IP:
  `RATE_LIMIT_ENABLED=false`.

## Quick start (local)

```bash
# 1. Infrastructure
pnpm infra:up

# 2. Mock Xendit (terminal A)
pnpm bench:mock-xendit

# 3. App stack with mock provider + rate limiter disabled (terminal B)
RATE_LIMIT_ENABLED=false \
XENDIT_API_URL=http://127.0.0.1:8099 \
XENDIT_SECRET_KEY=benchmark-secret \
XENDIT_WEBHOOK_TOKEN=benchmark-webhook-token \
RESEND_API_KEY= \
pnpm dev

# 4. Seed benchmark catalog + 1,000 pre-provisioned JWTs (terminal C)
pnpm bench:seed
```

`pnpm bench:seed` creates:

- `benchmark/.data/catalog.json` — 60 showtimes × 96 seats
- `benchmark/.data/tokens.json` — 1,000 users and tokens

Both files are gitignored. Override the user count with
`BENCH_USERS=5000 pnpm bench:seed:users`.

## Quick start (Docker)

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.benchmark.yml \
  up -d --build

docker compose \
  -f docker-compose.yml \
  -f docker-compose.benchmark.yml \
  --profile benchmark-seed run --rm benchmark-seed
```

The override disables the gateway limiter, starts `xendit-mock`, and points
payment-service at it. Use it only for benchmarks.

## Running

Runner executes **3 repeats** per 100 / 500 / 1,000 VUs, with 3-minute ramp,
10-minute steady state, 2-minute ramp-down, and 30-second think time. Each run
exports a summary under `benchmark/results/`. Runner seeds JWTs once before
the matrix (JWT expiry: 1 hour); full-flow reseeds catalog before each repeat.
For unusually long runs, refresh JWTs and split the matrix into batches.

```bash
SCENARIO=read      pnpm bench:levels
SCENARIO=hold      pnpm bench:levels
SCENARIO=full-flow pnpm bench:levels
```

Local runner needs `pnpm dev` with access to local Postgres. Docker runner needs
explicit seeding command (container has database access):

```bash
BENCH_SEED_CMD='docker compose -f docker-compose.yml -f docker-compose.benchmark.yml --profile benchmark-seed run --rm benchmark-seed' \
  SCENARIO=full-flow pnpm bench:levels
```

For Docker `hold`, seed catalog once using `benchmark-seed` before runner;
runner reruns that seed command per repeat. Existing booking records remain after
catalog reseed, so use isolated benchmark databases, not production data.

Equivalent individual runs (use `k6 run -e TOKEN_FILE="$PWD/benchmark/.data/tokens.json" -e CATALOG_FILE="$PWD/benchmark/.data/catalog.json"` for write scenarios):

```bash
pnpm bench:read       # public catalog + seat-map reads
pnpm bench:open-read  # fixed-arrival read load
pnpm bench:availability # health + catalog probe during faults
pnpm bench:hold       # hold + cancel, unique seat per VU
pnpm bench:full       # hold -> pay -> webhook -> ticket
pnpm bench:contention # all VUs race for one seat (409 is expected)
```

Typical level run:

```bash
LEVELS="100 500 1000" THINK_TIME=30 DURATION=10m \
  SCENARIO=read pnpm bench:levels
```

Each result includes p50/p95/p99/p99.9. Use `OUT=1` to also
write raw JSON samples, or set
`K6_PROMETHEUS_RW_SERVER_URL` to stream metrics with k6's Prometheus remote
write output.

### Open-loop read test

Closed-loop VUs slow down when the server slows down, which hides tail
latency. For a fixed arrival rate:

```bash
RATE=50 DURATION=10m k6 run benchmark/open-loop-read.js
```

Report both configured VUs and achieved request rate.

### Availability probe

Run a fixed-rate health + catalog probe while restarting a dependency:

```bash
RATE=5 DURATION=10m k6 run benchmark/availability.js
# in another terminal:
docker restart ticketing-redis
```

`availability_probe_errors` counts failed probes and
`availability_probe_duration` records their latency. Local Compose has
single-instance dependencies, so this measures outage visibility and recovery,
not HA failover. Set `PROBE_ERROR_BUDGET` when an outage is expected.

### Reliability / failure injection

The mock provider can inject rate limits, 5xx errors, and duplicate webhooks:

```bash
MOCK_XENDIT_RATE_LIMIT_RATE=0.1 \
MOCK_XENDIT_FAIL_RATE=0.1 \
MOCK_XENDIT_DUPLICATE_WEBHOOK=true \
docker compose -f docker-compose.yml -f docker-compose.benchmark.yml up -d
```

Run a low-VU `full-flow` and verify that failed payments are rejected, successful
ones still settle, and duplicate callbacks do not double-issue tickets. These
are correctness checks; keep the normal benchmark run at failure rate 0.

## Scenarios

| Scenario          | Path                 | What it measures                              | Payment     |
| ----------------- | -------------------- | --------------------------------------------- | ----------- |
| `read`            | `read.js`            | Gateway + cinema-service read path, no writes | none        |
| `open-loop-read`  | `open-loop-read.js`  | Same reads at fixed arrival rate              | none        |
| `availability`    | `availability.js`    | Fixed-rate health + catalog probe             | none        |
| `hold`            | `hold.js`            | Booking write path, Redis lock, hold + cancel | none        |
| `full-flow`       | `full-flow.js`       | End-to-end saga: pay → settle → ticket        | mock Xendit |
| `seat-contention` | `seat-contention.js` | Redlock contention, double-booking guard      | none        |
| `stress`          | `stress.js`          | Legacy aggressive ramp to find the knee       | real/mock   |
| `soak`            | `soak.js`            | Long-running leak / TTL drift                 | real/mock   |
| `smoke`           | `smoke.js`           | Single-user sanity check                      | real/mock   |

`hold.js` cancels each hold, so it can run for 10 minutes without exhausting
seat inventory. `full-flow.js` pays on about 1 in 12 iterations, cancels other
holds, and reserves distinct seats for paid iterations. Default catalog has
5,760 slots; runner reseeds before each full-flow repeat. Stop when k6 reports
catalog exhaustion rather than wrapping onto confirmed seats.

## Response metrics

| Metric                        | Type    | Meaning                                                  |
| ----------------------------- | ------- | -------------------------------------------------------- |
| `http_req_duration`           | Trend   | All HTTP response time; p50/p95/p99/p99.9 are summarized |
| `login_duration`              | Trend   | Login latency (fallback auth mode only)                  |
| `showtime_list_duration`      | Trend   | `GET /showtimes`                                         |
| `seat_map_duration`           | Trend   | `GET /showtimes/:id/seats`                               |
| `booking_hold_duration`       | Trend   | `POST /bookings/holds`                                   |
| `booking_pay_duration`        | Trend   | `POST /bookings/:id/pay`                                 |
| `booking_poll_duration`       | Trend   | `GET /bookings/:id` while waiting for the saga           |
| `booking_confirm_duration`    | Trend   | Pay → `CONFIRMED` + tickets issued                       |
| `booking_cancel_duration`     | Trend   | `POST /bookings/:id/cancel`                              |
| `ticket_lookup_duration`      | Trend   | Public ticket lookup                                     |
| `full_flow_duration`          | Trend   | Hold → ticket in `full-flow`                             |
| `availability_probe_duration` | Trend   | Health/catalog probe latency during faults               |
| `hold_errors`                 | Counter | Holds returning 409/410                                  |
| `pay_errors`                  | Counter | Pays returning >= 400                                    |

## Env vars

| Variable             | Default                        | Used by                          |
| -------------------- | ------------------------------ | -------------------------------- |
| `GATEWAY_URL`        | `http://localhost:3000/api/v1` | all                              |
| `VUS`                | scenario default               | read/hold/full-flow/stress/soak  |
| `THINK_TIME`         | `30` (seconds)                 | read/hold                        |
| `DURATION`           | `10m`                          | read/hold/open-loop-read         |
| `LEVELS`             | `100 500 1000`                 | `run-levels.sh`                  |
| `TOKEN_FILE`         | unset                          | hold/full-flow/contention        |
| `CATALOG_FILE`       | unset                          | hold/full-flow/contention        |
| `PAY_EVERY`          | `12`                           | full-flow paid-iteration spacing |
| `REPEATS`            | `3`                            | `run-levels.sh`                  |
| `BENCH_SEED_CMD`     | local `pnpm` seed              | Docker runner                    |
| `RATE`               | `50`                           | open-loop-read / availability    |
| `PRE_VUS`            | `50` / `10`                    | open-loop-read / availability    |
| `MAX_VUS`            | `1000` / `50`                  | open-loop-read / availability    |
| `PROBE_ERROR_BUDGET` | `0`                            | availability                     |
| `OUT`                | `0`                            | `run-levels.sh` (`1` = JSON)     |
| `P50_BUDGET`         | `250` ms                       | thresholds                       |
| `P95_BUDGET`         | `500` ms                       | thresholds                       |
| `P99_BUDGET`         | `1000` ms                      | thresholds                       |
| `P999_BUDGET`        | `2000` ms                      | thresholds                       |
| `ERROR_RATE_BUDGET`  | `0.01`                         | `http_req_failed` threshold      |

When `TOKEN_FILE` is absent, the suite falls back to registering/logging in one
user per VU. That adds bcrypt CPU and auth traffic; use it only for smoke tests.

## Expected domain outcomes

- `409` on a hold means the seat is already held or booked. In
  `seat-contention` this is expected; in `read`/`hold`/`full-flow` it is a
  failure and is counted in `hold_errors`.
- `404` on an unknown ticket is a valid lookup result, not an infrastructure
  error.
- `full-flow` waits for **CONFIRMED plus issued tickets**, not just the HTTP
  `200` from `/pay` (which only creates the invoice).

## Interpreting the 100 / 500 / 1,000 run

- Compare **achieved RPS** and p95/p99 at each level; do not compare only
  configured VUs. At 30 s think time, 1,000 VUs is roughly 33 iterations/s.
- If throughput flattens while p99 grows, you have found the knee. Record the
  bottleneck (gateway CPU, Postgres, Redis, RabbitMQ, DB pool, etc.).
- `read` isolates gateway/cinema capacity. `hold` adds booking writes and
  locks. `full-flow` adds payment, webhook, event, and ticket issuance.
- Local Compose is single-instance for Postgres, Redis, RabbitMQ, and every
  service. It measures a baseline and outage/restart recovery, not HA or
  horizontal scaling.
- 10,000 and 100,000 VUs require distributed generators (k6 Operator on
  Kubernetes or Grafana Cloud k6), not a single local k6 process.

## Troubleshooting

| Symptom                      | Likely cause                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| Lots of 429s                 | Gateway rate limiter still enabled; set `RATE_LIMIT_ENABLED=false` |
| 401s                         | `TOKEN_FILE` missing/expired; rerun `pnpm bench:seed:users`        |
| 409s everywhere              | Seats already consumed; reseed catalog and reset bookings          |
| Full-flow stays `PENDING`    | Mock Xendit not running or webhook token mismatch                  |
| No tickets after `CONFIRMED` | Ticket-service/topic consumer not running                          |
| k6 `open()` error            | `TOKEN_FILE`/`CATALOG_FILE` path is not absolute or missing        |
