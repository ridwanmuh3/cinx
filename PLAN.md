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

## Open questions (resolved during build)

- UI library — Naive UI components + Tailwind, themed to the CinX board look.
- Admin UI — separate route/guard in the same Vue app (`requiresAdmin` route meta).
- `packages/shared` consumption — built output (`dist/index.js`) via `workspace:*`.
