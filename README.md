# CinX — Ticketing Cinema

## 1. What this is, why, and how it's solved

**What.** CinX sells cinema seats end to end: browse movies and showtimes, pick
seats on a live seat map, hold them while you pay, get tickets by email, and
cancel with a refund if plans change. It also ships the admin side for managing
movies, theaters and showtimes.

**Why.** Ticketing looks like CRUD until you ask the only question that matters:
_can two people ever buy seat A7 for the same showtime?_ A naive "check, then
insert" answers yes under load, and the business consequences (refunds,
angry customers, a sold seat that doesn't exist) are worse than a slow page.
The project exists to show that problem handled honestly — plus the parts
portfolio projects usually skip: real payments, refunds, transactional email,
tracing, and the failure paths.

**How it's solved.** Booking is two-phase — hold, then pay:

- **Fast path:** a Redis `redlock` per seat, `seat:{showtimeId}:{seatId}`, held
  for a five-minute window. Contention fails fast with `409`.
- **Hard guarantee:** a `UNIQUE (showtime_id, seat_id)` constraint in Postgres.
  The lock is only an optimisation; a broken or expired lock still cannot
  double-sell, because the insert loses the race.
- **Honest failure:** Redis down is `503` ("can't decide"), never `409`
  ("someone took it"). The system fails closed rather than lying to the user.
- **Async payment, no lost sales:** Xendit hosts the invoice. A webhook
  confirms it; if the webhook never arrives, `POST /bookings/:id/sync-payment`
  asks Xendit directly. Confirmation is idempotent, so retries are safe.
- **Refunds are a saga step, not a status flip:** cancelling a paid booking
  requests a provider refund, and the booking only becomes `REFUNDED` once
  the provider says the money moved. Until then the tickets keep working and
  the seats stay the customer's.

```
Browser (Vue SPA)
      │ REST + JWT
      ▼
  gateway ──gRPC──┬─► user-service     (users, auth)
                  ├─► cinema-service   (movies, theaters, showtimes, seats)
                  └─► ticket-service   (bookings, locks, payments) ─► Redis
                            │                                     └─► Postgres
                            └─ events ─► notification-service (email)
```

Vocabulary lives in [`CONTEXT.md`](./CONTEXT.md); REST contract in
`docs/openapi.yaml`, schema in `docs/ERD.md`, design trade-offs (CAP/PACELC) in
`docs/ARCHITECTURE.md`, and build history in `PLAN.md`.

## 2. Tech stack

| Layer         | Choice                                                   |
| ------------- | -------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo, TypeScript                  |
| Backend       | NestJS; REST gateway → gRPC microservices                |
| Data          | PostgreSQL 18 (one database per service, TypeORM)        |
| Locking       | Redis 8 + redlock                                        |
| Payments      | Xendit hosted invoice + webhook (live, no mock)          |
| Events        | RabbitMQ fanout → notification-service (Resend email)    |
| Frontend      | Vue 3 + Vite + Pinia + Naive UI + Tailwind               |
| Observability | OpenTelemetry → Tempo + Prometheus → Grafana             |
| Quality       | Jest, Playwright, ESLint 9, Prettier, k6, GitHub Actions |

## 3. Features

**Customers**

- Browse movies, showtimes and a live seat map (available / held / booked).
- Two-phase seat holding with a visible countdown on the hold window.
- Pay via Xendit hosted checkout, with a polling fallback if the webhook is
  missed so a paid booking always confirms.
- Tickets with `TKT-XXXXXX` codes, lookup by code, booking history.
- Cancel a hold (seats released instantly) or a paid booking (full refund).
- Registration and login with JWT; confirmation and receipt emails.

**Admins**

- CRUD for movies, theaters and showtimes, guarded by a role check.
- Showtime overlap prevention per theater.

**Platform**

- Ledger-safe double-booking guard: redlock plus a DB uniqueness constraint.
- Refund lifecycle (`REFUND_PENDING` → `REFUNDED`) with revert on a failed
  refund, plus a reconciliation cron for expired holds and in-flight refunds.
- End-to-end tracing across the gateway, services and async email consumer.
- Docker Compose for the whole stack; CI (lint, tests, build) and CD (image
  publishing); k6 load and seat-contention benchmarks; Playwright E2E.

## 4. How to run

**Docker (everything, one command path):**

```bash
cp .env.example .env        # set JWT_SECRET, PG_PASSWORD, XENDIT_* (see below)
pnpm docker:up              # postgres, redis, rabbitmq, observability, apps
pnpm docker:seed            # admin user + demo cinema catalog
pnpm demo                   # register → hold → pay → ticket lookup
```

**Local dev:**

```bash
cp .env.example .env        # set JWT_SECRET (>= 32 chars) + PG_PASSWORD
pnpm install
pnpm infra:up               # postgres, redis, rabbitmq, observability

pnpm --filter @ticketing/user-service seed:admin    # admin@example.com
pnpm --filter @ticketing/cinema-service seed

pnpm build && pnpm dev      # gateway :3000, SPA :5173
```

| Surface      | URL                                 |
| ------------ | ----------------------------------- |
| Web          | http://localhost:5173               |
| REST gateway | http://localhost:3000/api/v1        |
| Health       | http://localhost:3000/api/v1/health |
| Grafana      | http://localhost:3001               |

**Payments.** Xendit is live, so `.env` needs `XENDIT_SECRET_KEY` and
`XENDIT_WEBHOOK_TOKEN`. For webhooks locally, expose the gateway
(`cloudflared tunnel --url http://localhost:3000`), set `XENDIT_WEBHOOK_URL`,
then register it:

```bash
pnpm --filter @ticketing/ticket-service xendit:webhook
```

Without a public callback, payments still confirm through
`POST /bookings/:id/sync-payment`. Emails need `RESEND_API_KEY`; without it
`notification-service` logs the message instead of sending (dry run).

**Tests:**

```bash
pnpm test            # unit, all workspaces — no infra needed
pnpm lint
pnpm --filter @ticketing/ticket-service test:integration  # needs pnpm infra:up
pnpm --filter web e2e:install && pnpm --filter web e2e    # Playwright E2E
```

**Benchmarks (k6 + a seeded live stack):** see `benchmark/README.md`.
