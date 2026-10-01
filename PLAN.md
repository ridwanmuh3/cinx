# Ticketing Cinema System — Plan

A microservices ticketing/cinema portfolio project. NestJS microservices over
TCP with application-level seat locking backed by Redis (redlock).

## Stack

| Layer       | Choice                                         |
| ----------- | ---------------------------------------------- |
| Language    | TypeScript                                     |
| Monorepo    | pnpm workspaces + Turborepo                    |
| Backend     | NestJS (microservices over TCP)                |
| API surface | NestJS gateway exposing REST for the web app   |
| Databases   | PostgreSQL 18.4 + TypeORM (one DB per service) |
| Locking     | Redis 8.10 + `redlock` on top of `ioredis`     |
| Payment     | Mock provider (simulated success/failure)      |
| Frontend    | Vue 3 + Vite (SPA)                             |

Contracts live in `docs/openapi.yaml` (REST surface) and the ERD in
`docs/ERD.md` (relational model). The ERD maps 1:1 to TypeORM entities.

## Repo layout

```
ticketing-cinema/
├── apps/
│   ├── gateway/          # REST BFF → TCP to services
│   ├── user-service/     # users + auth (JWT, roles)
│   ├── cinema-service/   # movies, theaters, showtimes, seat maps
│   ├── ticket-service/   # bookings, Redis seat-locking, mock payment
│   └── web/              # Vue 3 SPA
├── packages/
│   └── shared/           # DTOs, TCP message-pattern constants, types
├── infra/
│   ├── docker-compose.yml # postgres:18.4 + redis:8.10
│   └── init/init.sql      # creates user_db, cinema_db, ticket_db
├── pnpm-workspace.yaml
├── turbo.json
└── justfile
```

## Service boundaries (database-per-service)

- **user-service** — `user_db`; Users, auth, JWT, role guard (admin/user).
- **cinema-service** — `cinema_db`; Movies, Theaters, Showtimes, Seats.
- **ticket-service** — `ticket_db`; Bookings, BookingSeats, Payments, Tickets.
  Owns seat availability state via Redis locks. Reads seat validity from
  cinema-service over TCP. `seat_id`/`showtime_id` are logical references
  (no FKs across databases); seat data is snapshotted at hold time. The
  `UNIQUE (showtime_id, seat_id)` index on BookingSeats is the hard
  double-booking guard.
- **gateway** — stateless; validates JWT, fans REST calls out over TCP using
  message patterns from `packages/shared`.

## TCP contract

- All message patterns live in `packages/shared` (e.g. `booking.hold`,
  `payment.confirm`, `cinema.seatMap`). No stringly-typed patterns across apps.
- Gateway ↔ services: request/response via `client.send()`.
- Services use `@nestjs/microservices` `TcpOptions`.

## Seat-locking with redlock

Seat availability = lock on resource key `seat:{showtimeId}:{seatId}`.

1. **Hold** — `booking.hold`: ticket-service validates seats with
   cinema-service, then `redlock.lock([seat keys], TTL 5 min)`.
   - Redlock acquires all resources together and auto-releases on partial
     failure → a seat already held means the whole hold fails.
2. Failure → 409 Conflict (some seats taken).
3. Success → Booking doc `PENDING` + `expiresAt`, return `bookingId` +
   mock payment details.
4. **Pay** — mock provider; gateway forwards result via `payment.confirm`.
5. On confirm: re-check/extend lock, mark Booking `CONFIRMED`, create Ticket,
   release locks.
6. On cancel/fail/TTL expiry: release locks, mark Booking `EXPIRED`/`CANCELLED`.
7. Reconciliation job (cron in ticket-service) expires stale `PENDING`
   bookings as belt-and-suspenders; redlock TTL auto-releases the lock itself.

DB is the source of truth; Redis is the concurrency layer for seat holding.

## Build phases

### [COMPLETED] Phase 0 — Scaffold

- Root: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `.gitignore`.
- `infra/docker-compose.yml` — postgres:18.4-alpine + redis:8.10-alpine;
  `infra/init/init.sql` creates the three databases on first boot.
- `packages/shared` skeleton (patterns + DTOs, consumed via `workspace:*`).
- 4 bootable NestJS apps (gateway, user, cinema, ticket) with TCP health check.
- `redlock` + `ioredis` Redis 8 compatibility probe
  (`apps/ticket-service/src/scripts/redis-smoke.ts`, run with
  `pnpm --filter @ticketing/ticket-service smoke:redis`).
- `justfile` commands for install/dev/build/test/down/psql.

### [COMPLETED] Phase 1 — user-service

- TypeORM `User` entity in `user_db` (email unique, bcrypt password, role).
- Register / login → JWT (access token, 1h TTL), role guard.
- TCP handlers `user.register`, `user.login`, `user.me`; shared error format
  via `rpcErrorPayload` (`RpcException` with statusCode/message/error); global
  ValidationPipe maps DTO failures to 400 RPC errors.
- Admin bootstrap: `pnpm --filter @ticketing/user-service seed:admin`
  (`admin@example.com` / `admin1234`, env-overridable).
- Verified end-to-end against live Postgres 18.4 + Redis 8.10: register
  (incl. duplicate 422, validation 400), login (incl. bad password 401),
  me (incl. unknown user 401), health.ping.

### Quality gates (shared lint + unit tests)

- **`packages/eslint-config`** (`@ticketing/eslint-config`) — flat ESLint 9
  config: `@eslint/js` + `typescript-eslint` recommended, curated type-aware
  rules (`await-thenable`, `require-await`, `no-floating-promises`,
  `no-misused-promises` via `projectService`), `eslint-config-prettier` last,
  Nest-friendly overrides. Any app adopts it with `eslint.config.mjs` →
  `export default defineConfig()`.
- **Prettier** — root `.prettierrc` + `.prettierignore`; per-package
  `format`/`format:check` use `--ignore-path ../../.prettierignore`.
- **Toolchain hoisted at root** (`eslint`, `prettier`, `jest`, `ts-jest`,
  `@types/jest`, `@nestjs/testing`, `jest-mock-extended`); pnpm's PATH walk
  makes `eslint`/`jest`/`prettier` resolvable from any workspace package.
- **Jest** — `@ticketing/user-service` has `users.service.spec.ts`
  (9 cases, ~97% statement coverage on the service): register hash + DTO
  shape, duplicate email (pre-check + `23505` paths) → 422, login success /
  wrong password / unknown email → 401, me known / unknown → 401.
- Commands: `pnpm lint` (turbo), `pnpm format`, `pnpm format:check`,
  `pnpm --filter @ticketing/user-service test` / `test:cov`.
- Pattern for later services: add devDep `@ticketing/eslint-config`, copy the
  `eslint.config.mjs`, add `lint`/`format`/`test` scripts + jest block.

### [COMPLETED] Phase 2 — cinema-service

- TypeORM entities: `Movie`, `Genre`, `Theater`, `Seat`, `Showtime`.
- Admin CRUD; public queries (movies, showtimes, seat map).
- Seed script with demo data.
- Genres modeled as a `genres` table + `movie_genres` join (ManyToMany),
  exposed as `genres: string[]` on the wire — API shape unchanged.
- 7 unit tests (showtime overlap primitives + create): ~100% pass.

### [COMPLETED] Phase 3 — ticket-service

- TypeORM entities: `Booking`, `BookingSeat`, `Payment`, `Ticket`.
- Seat-lock manager (redlock) with the hold/pay/confirm/expire flow.
- Mock payment provider (simulated delay, success/failure hook).
- Reconciliation job (cron every minute + `pnpm --filter @ticketing/ticket-service reconcile` script).
- `booking.hold` validates seats against cinema-service (snapshot at hold
  time), acquires a multi-seat redlock (5 min TTL, 409 on contention), and
  creates a `PENDING` booking + seat snapshots + pending payment.
- `payment.confirm` re-checks/extends the lock (410 if expired/lock lost),
  marks the booking `CONFIRMED` + issues `TKT-XXXXXX` tickets (one per seat),
  or `CANCELLED` on payment failure; locks released early via an in-memory
  handle registry (redlock TTL is the fallback).
- Unit tests: 20 cases covering hold/lock contention/persistence failure,
  cancel, get/list ownership, confirm (paid/failed/expired/lock-lost/
  idempotent), ticket creation, reconciliation.

### [COMPLETED] Phase 4 — gateway + web

- Gateway REST endpoints: auth (register/login/me), movies/theaters/showtimes
  CRUD (admin), seat map, hold/pay/cancel, booking list/get, ticket lookup,
  health — REST on :3000, fan-out over TCP via `packages/shared` patterns.
- Gateway unit tests: `bookings.service.spec.ts` + `rpc.util.spec.ts` (9 cases).
- Vue 3 + Vite app (lazy routes): login/register, movie list → detail →
  showtime → seat picker → checkout → mock payment → confirmation, booking
  history, admin screens (movies/theaters/showtimes) with `authGuard`/
  `adminGuard`. Tailwind; dev proxy to `http://localhost:3000`.
- Verified: `pnpm --filter web build` clean (was previously failing — fixed
  Vue/TS API drift), `pnpm --filter web test` (3 pass), repo-wide `pnpm test`
  (6 tasks), `pnpm lint` (6 tasks).

### [COMPLETED] Phase 5 — Tests + docs

- Integration tests against live Postgres + Redis
  (`apps/ticket-service/src/bookings/bookings.integration-spec.ts`,
  `pnpm --filter @ticketing/ticket-service test:integration`):
  lock contention → 409, short-TTL redlock auto-release, confirm after Redis
  lock loss → 410 + booking `EXPIRED`, confirm when DB already `EXPIRED` → 410.
  Unit suite remains infra-free (`testPathIgnorePatterns: integration-spec`).
- Root `README.md` — architecture mermaid, quick start, test matrix, layout.
- Demo walkthrough: `scripts/demo-walkthrough.sh` / `pnpm demo` (register →
  showtime → hold → mock pay → ticket lookup against the REST gateway).

### [COMPLETED] Phase 6 — Refunds (saga compensation for paid bookings)

- `POST /bookings/:id/cancel` no longer dead-ends on a paid booking: a
  `CONFIRMED` booking is refunded through Xendit instead of rejected with 409.
- New terminal/in-flight states `REFUND_PENDING` + `REFUNDED` on `Booking`,
  and `REFUND_PENDING` + `REFUNDED` (+ `refund_id`, `refunded_at`) on
  `Payment`; `XenditClient.createRefund`/`getRefund` wrap `POST /refunds` and
  `GET /refunds/{id}`.
- Money invariant: a booking is only `REFUNDED` once Xendit reports
  `SUCCEEDED`. A `PENDING` refund keeps the booking paid — its seats stay
  `BOOKED` and its tickets stay valid — and is settled by
  `reconcileRefunds()` (same every-minute cron). A `FAILED` refund reverts the
  booking to `CONFIRMED`, since no money moved. Tickets are voided only on a
  settled refund.
- Freed seats are resellable: `REFUNDED` was added to the stale-seat-row
  reaper, so the `UNIQUE (showtime_id, seat_id)` guard does not strand them.
- 15 new unit cases (refund success / in-flight / 409s / 404 ownership / 502
  provider failure, availability for `REFUND_PENDING`/`REFUNDED`, reconcile
  finalize/revert/leave-alone/provider-error); ticket-service 68 pass.
- Web: `Cancel & refund` action on confirmed bookings with refund-aware copy,
  new status labels/chips, updated FAQ. Docs: `openapi.yaml` (cancel + enums +
  `Payment.refundId`), `ERD.md`, `ARCHITECTURE.md` §3.

## Phase 7 — Domain flow cohesion

Trigger: the booking flow does not read as one coherent story. Vocabulary is
overloaded, one status field carries three concerns, and one leg of the flow
(the confirmation email) never runs at all. Canonical language now lives in
[`CONTEXT.md`](./CONTEXT.md); this phase makes the code agree with it.

Decisions taken (recorded here because they are expensive to reverse):

- **Booking is the noun; hold is the action.** There is no second entity.
- **`CANCELLED` stays one state, but records why** — a `cancellationReason`
  distinguishes `CUSTOMER` from `PAYMENT_DECLINED`. `EXPIRED` keeps its own
  meaning (the hold window lapsed), so "cancelled" never means "timed out".
- Renames and removals below are taken now rather than deferred, because
  leaving them means the next feature pays the confusion tax again.

**Planning update (after increment B/C):** execution order was changed from
A→D to **B → C → A → D**. A is mechanical churn across contracts and fixtures;
B and C are the ones that change behaviour (B encodes the vocabulary decision,
C fixes a flow that never ran). Doing the behaviour first meant the review
budget went to the part a user can feel, and nothing in A blocks either. A and
D remain planned and unstarted.

### Increment A — Payment references tell the truth, dead paths removed (F5, F7) **[COMPLETED]**

- `Payment.providerId` → `externalId`. It always held `cix-{bookingId}` — _our_
  reference handed to the provider, not the provider's. Renamed on the entity,
  the REST/gRPC contracts and the web types.
- `providerTxnId` stops being stuffed with the Xendit **invoice** id (it was
  the same value as `invoiceId` on the webhook path, and the external
  reference on the confirm path). It now carries only the provider's
  transaction reference, or `null`.
- Delete the unreachable `Confirm` RPC: proto, `@GrpcMethod`, stub,
  `PaymentConfirmRequest`, `BookingsService.confirm` and its tests. Nothing
  could reach it (no gateway route), so it advertised a third confirmation
  path that does not exist. Confirmation paths are now exactly two: webhook
  and `sync-payment`.
- **Constraint:** `external_id` is `NOT NULL`, and this repo uses
  `synchronize: true` with no migrations. A dev `ticket_db` that already has
  payment rows needs recreating (`pnpm infra:down` + volume) rather than
  TypeORM altering a `NOT NULL` column in place.
- **Found while deleting:** `booking_confirms_total` (the Grafana "Booking
  confirmations" panel) was only ever incremented from the dead `confirm()`
  path, so the panel was permanently empty. The counter is now incremented on
  the two live confirmation paths (webhook, `sync-payment`).
- The two integration tests that drove the dead path were retargeted to the
  webhook, which exercises the same 410 liveness guard over live Postgres +
  Redis. Unit cases: 72 → 67 (5 dead-path cases removed).

### Increment B — A cancellation says why it happened (F2, F3) **[COMPLETED]**

- Add `cancellationReason` (`CUSTOMER` | `PAYMENT_DECLINED`) to `Booking`,
  exposed on `BookingDto` and the REST contract.
- Set it at both sites that currently produce `CANCELLED`: the customer's
  `cancel` (`CUSTOMER`) and a provider decline via webhook/sync
  (`PAYMENT_DECLINED`).
- `EXPIRED` is untouched and stays the only state for a lapsed hold.

### Increment C — Reconnect the confirmation-email leg (F1) **[COMPLETED]**

- `notification-service` consumes `booking.confirmed` and `payment.received`,
  but **nothing publishes them** — ticket-service has no RMQ producer, so the
  emails documented in `README.md` never send. Wire the producer.
- Resolve the recipient through the existing `UserService.Get` →
  `UserContactDto` RPC (already implemented and currently unconsumed) via a
  ticket-service → user-service client, mirroring the cinema client module.
- Publish from both confirmation paths (webhook and `sync-payment`), stamped
  with `injectTraceHeaders()` so `RmqTraceInterceptor` finally has a producer
  to join. Publishing is best-effort: a dead broker must never fail a booking
  that is already paid for.

### Increment D — One writer of tickets (F6) **[COMPLETED]**

- Tickets are currently written by `ensureTickets()` at confirmation **and**
  by the gateway's `enrich()` calling `CreateTickets` on every `GET`. A read
  should not create domain state.
- Split the RPC: `IssueTickets` (write, used internally at confirmation) and
  `ListTickets` (read, used by the gateway to display them).
- The gateway's `enrich()` now calls `ListTickets`, so loading a booking no
  longer creates tickets. `listTickets` is asserted to be write-free in the
  unit suite (no `tickets.create`, no `tickets.save`, no seat-map fetch).
- The integration test that previously proved "confirmation issues tickets"
  through the read path now proves it through `listTickets` after a PAID
  webhook — a stronger assertion, since the tickets must already exist.

### Acceptance criteria

| #   | Given                            | When                | Then                                                                 |
| --- | -------------------------------- | ------------------- | -------------------------------------------------------------------- |
| A1  | a Booking is charged             | `charge`            | the payment row carries `externalId = cix-{bookingId}`               |
| A2  | a webhook settles a payment      | `webhook`           | `providerTxnId` is never set to the invoice id                       |
| A3  | the codebase                     | build               | no `Confirm` RPC, stub, contract or service method remains           |
| B1  | an unpaid Booking                | customer cancels    | `CANCELLED` with reason `CUSTOMER`                                   |
| B2  | a pending Booking                | provider declines   | `CANCELLED` with reason `PAYMENT_DECLINED`                           |
| B3  | a lapsed hold                    | reconcile           | `EXPIRED`, no cancellation reason                                    |
| C1  | a Booking is confirmed           | webhook PAID        | `booking.confirmed` + `payment.received` published once              |
| C2  | the same booking                 | sync-payment PAID   | same two events, never duplicated                                    |
| C3  | RabbitMQ or user-service is down | confirm             | the Booking still confirms; publishing failure is logged, not thrown |
| D1  | a confirmed Booking              | `GET /bookings/:id` | tickets are read, not created                                        |
| D2  | a Booking with no tickets        | confirmation        | tickets are issued exactly once by ticket-service                    |

### Phase 7 outcome

All four increments landed. Flow-level result:

- The customer email leg now runs (it never did before).
- `CANCELLED` says why it happened; `EXPIRED` keeps its own meaning.
- Payment references no longer lie, and there is exactly one ticket writer.
- Vocabulary in code, docs and `CONTEXT.md` agree.

Deliberately left out of this phase (candidates, not commitments):

- `providerTxnId` is now always NULL for the Invoices flow. It is kept because
  the receipt template and contract still reference it, but if no provider ever
  supplies a settlement id it should be deleted rather than carried.
- Seats are still freed by deleting stale `booking_seats` rows on the next
  hold. `REFUNDED` was added to that reaper, but the same mechanism now serves
  CANCELLED, EXPIRED, REFUNDED and timed-out PENDING — a candidate for a
  cleaner "release the seat" operation.

## Open questions (resolved during build)

- UI library — Naive UI components + Tailwind, themed to the CinX board look.
- Admin UI — separate route/guard in the same Vue app (`requiresAdmin` route meta).
- `packages/shared` consumption — built output (`dist/index.js`) via `workspace:*`.
