# CinX — Cinema Ticketing Platform

> A seat-level cinema booking system built as a distributed system: five-minute
> seat holds, asynchronous payments, event-driven ticket issuance, and refunds
> that follow the money instead of flipping a status flag.

| | |
| --- | --- |
| **Type** | Portfolio / engineering showcase |
| **Role** | Solo — domain design, backend, frontend, infrastructure, tests |
| **Stack** | Vue 3 · NestJS · gRPC · PostgreSQL · Redis · RabbitMQ · Xendit |
| **Status** | Working end-to-end; development/demo topology (no HA claim) |
| **Repo** | [`ticketing-cinema`](https://github.com/ridwanmuh3/ticketing-cinema) |

---

## 1. Project Overview

Cinema ticketing looks simple until two customers tap the same seat at the same
second. The interesting problems are not CRUD screens — they are **seat
contention**, **payment that arrives late or never**, and **state that has to
stay correct across services that own different data**.

CinX models the full journey: browse a catalog, pick a showtime, choose seats,
hold them for five minutes, pay through a hosted checkout, receive tickets by
email, and — when something goes wrong — cancel or refund without ever selling a
seat twice.

The core implementation combines two layers of protection:

1. **Redis `redlock`** per seat (`seat:{showtimeId}:{seatId}`, TTL 5 minutes)
   as the fast concurrency layer.
2. **`UNIQUE (showtime_id, seat_id)`** on `booking_seats` as the hard guarantee.
   The database is the source of truth; Redis is only an optimization.

Everything else follows from that decision: the booking service snapshots seat,
movie, theater, and showtime data at hold time, payment and ticket issuance run
through a RabbitMQ topic exchange, and refunds are a saga compensation rather
than a UI action.

### At a glance

| Dimension | Value |
| --- | --- |
| Deployable apps | 8 (Vue SPA, REST gateway, 6 backend services) |
| gRPC domain services | 5 — user, cinema, booking, payment, ticket |
| Databases | 5 logical PostgreSQL databases, one instance in dev |
| REST surface | 27 documented operations in `docs/openapi.yaml` |
| Hold window | 5 minutes, maximum 8 seats per booking |
| Payment provider | Xendit hosted invoices + webhooks + refunds |
| Email | Resend (best-effort, non-transactional) |
| Observability | OpenTelemetry → Collector → Tempo / Prometheus / Grafana |
| Verification | Jest, Vitest, Playwright, k6 (100 / 500 / 1,000 VU matrix) |

### What is intentionally out of scope

CinX is a portfolio project, not a production deployment. High availability for
PostgreSQL, Redis, and RabbitMQ is not configured; the default topology is a
single instance of each. There is no transactional outbox, no bounded-retry
dead-letter queue, and no versioned migration workflow yet. These are documented
as follow-ups rather than hidden.

---

## 2. Features

### Customer experience

- **Catalog browsing** — now-showing and coming-soon movies, genres, duration,
  age rating, posters, and showtimes with server-provided pricing.
- **Seat selection** — a live seat map that combines theater geometry from
  `cinema-service` with availability from `booking-service`; seats are
  `AVAILABLE`, `HELD`, or `BOOKED`.
- **Accounts** — JWT authentication, registration, login, session verification,
  and personal booking history.
- **Five-minute hold** — a countdown-backed reservation window. Up to eight
  seats per booking; conflicting seats return `409` with the conflicting seat
  IDs so the UI can highlight them.
- **Hosted checkout** — an Xendit invoice is created server-side; the browser is
  redirected to the provider, so card data never touches the application.
- **Confirmation that converges** — the confirmation page polls while
  `payment.settled → booking.confirmed → tickets.issued` propagates, and
  `sync-payment` acts as an anti-entropy fallback when a webhook is lost.
- **Tickets** — issued once per paid seat, with a human-readable
  `TKT-XXXXXXXX` code, and publicly verifiable by code.
- **Cancel and refund** — unpaid bookings cancel immediately; paid bookings go
  through `REFUND_PENDING` and only become `REFUNDED` when the provider
  confirms the money moved. Tickets are voided only after that confirmation.
- **Email** — booking confirmation, ticket codes, and payment receipts through
  Resend, with logging-only fallback when no API key is configured.

### Administration

- **Catalog management** — create, edit, and delete movies, genres, theaters,
  and showtimes behind an admin role check.
- **Theater layout** — define rows and seats when creating an auditorium; seats
  carry category (`REGULAR`, `VIP`, `COUPLE`), accessibility, and disabled
  flags.
- **Schedule integrity** — showtime creation and updates reject overlapping
  slots in the same theater, using a half-open interval check against the
  movie's duration.
- **Safe pricing** — amounts are stored as integer IDR (`bigint`), never
  floating point.

### Platform and engineering

- **Database per service** — each service writes only its own database; other
  domains are referenced logically and composed through APIs or events.
- **Saga orchestration** — the gateway routes commands, `booking-service` owns
  saga state, and payment/ticket react to events. No service reaches into
  another service's database.
- **Idempotent consumers** — duplicate webhooks and replayed events do not
  double-issue tickets or double-refund.
- **Reconciliation crons** — expiry, confirmation retry, payment sync, and
  refund retry repair state when an event goes missing.
- **Honest errors** — a dead Redis returns `503 Seat lock unavailable`, not a
  misleading `409 seat already taken`.
- **Observability** — OTLP traces and metrics from every service, browser trace
  propagation, and Grafana dashboards over Tempo and Prometheus.
- **Test and load tooling** — unit and integration tests, Playwright end-to-end
  flows, and k6 scenarios with a local mock Xendit so benchmarks are
  deterministic and never consume provider quota.
- **CI/CD** — format, lint, unit tests, build, and Compose validation on every
  push; eight container images built and pushed to GHCR on `main`.

---

## 3. Tech Stack

| Layer | Technologies | Why it is here |
| --- | --- | --- |
| **Frontend** | Vue 3, TypeScript, Vite 7, Pinia, Vue Router, Naive UI, Tailwind CSS 4 | Fast SPA with typed API contracts, a component library for complex admin tables, and utility CSS for layout |
| **API layer** | NestJS 11, REST/JSON, Passport JWT, Helmet, `express-rate-limit`, class-validator | One backend-for-frontend that shapes responses for the UI and keeps gRPC out of the browser |
| **Inter-service** | gRPC, Protocol Buffers, typed stubs in `@ticketing/shared` | Strict contracts and binary efficiency between services |
| **Data** | PostgreSQL 18, TypeORM, Redis 6 client, `redlock` | ACID per service, unique constraints as the final guard, fast expiring locks |
| **Messaging** | RabbitMQ, topic exchange `ticketing.internal`, durable queues, manual ack | Decouple booking, payment, ticket, and notification |
| **Integrations** | Xendit (invoices, webhooks, refunds), Resend (email) | Realistic payment lifecycle with an asynchronous provider |
| **Observability** | OpenTelemetry SDK, OTel Collector, Tempo, Prometheus, Grafana | End-to-end traces across HTTP, gRPC, and events |
| **Tooling** | pnpm workspaces, Turborepo, Docker Compose, GitHub Actions, GHCR | Monorepo builds, reproducible local stack, automated checks and images |
| **Testing** | Jest, Vitest, Playwright, k6 | Unit, component, browser, and load coverage |

---

## 4. Architecture

### System shape

The browser talks to exactly one origin: a stateless REST gateway. The gateway
is a backend-for-frontend — it translates JSON into gRPC calls, aggregates
catalog and availability, normalizes gRPC errors into HTTP semantics, and owns
authentication middleware. The SPA never learns that six services exist.

```mermaid
flowchart TB
    Web["Browser · Vue 3 SPA"] -->|REST + JWT| Gateway["API Gateway · :3000"]

    subgraph Services["NestJS services"]
        Gateway -->|gRPC| User["user-service · accounts"]
        Gateway -->|gRPC| Cinema["cinema-service · catalog"]
        Gateway -->|gRPC commands| Booking["booking-service · bookings + seat locks"]
        Gateway -->|gRPC commands| Payment["payment-service · payments + Xendit"]
        Gateway -->|gRPC commands| Ticket["ticket-service · tickets"]

        Booking -->|validate seats / price| Cinema
        Booking -->|customer contact| User
        Booking -->|booking.*| MQ["RabbitMQ · ticketing.internal"]
        Payment -->|payment.*| MQ
        Ticket -->|tickets.*| MQ
        MQ -->|payment.*| Booking
        MQ -->|booking.*| Payment
        MQ -->|booking.confirmed / refunded| Ticket
        MQ -->|tickets.issued / payment.received| Notification["notification-service · email"]
    end

    subgraph PG["PostgreSQL · one instance in dev"]
        UserDB[(user_db)]
        CinemaDB[(cinema_db)]
        BookingDB[(booking_db)]
        PaymentDB[(payment_db)]
        TicketDB[(ticket_db)]
    end

    User --> UserDB
    Cinema --> CinemaDB
    Booking --> BookingDB
    Payment --> PaymentDB
    Ticket --> TicketDB

    Booking -->|seat locks| Redis[(Redis)]
    Payment -->|invoice / status / refund| Xendit["Xendit"]
    Web -->|hosted checkout| Xendit
    Xendit -->|webhook| Gateway
    Notification --> Resend["Resend"]
```

### Service ownership

| Service | Owns | Commands / responsibilities | Data |
| --- | --- | --- | --- |
| `gateway` | Nothing (stateless) | REST routing, JWT auth, DTO validation, response aggregation, webhook entry | — |
| `user-service` | Identity | Register, login, profile, admin role, contact lookup | `user_db` |
| `cinema-service` | Catalog | Movies, genres, theaters, seats, showtimes, pricing, overlap rules | `cinema_db` |
| `booking-service` | Reservation lifecycle | Hold, cancel, list, availability, charge preparation, expiry and retry crons | `booking_db` + Redis locks |
| `payment-service` | Money state | Charge, webhook, status sync, refunds, payment reconciliation | `payment_db` |
| `ticket-service` | Issued admission | Issue, void, list, lookup by code | `ticket_db` |
| `notification-service` | Nothing (stateless) | Consume events, render and send email | — |

### The booking saga

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant G as Gateway
    participant B as booking-service
    participant R as Redis
    participant X as Xendit
    participant P as payment-service
    participant T as ticket-service
    participant N as notification-service

    C->>G: POST /bookings/holds
    G->>B: Hold(showtime, seats)
    B->>B: validate seats + price via cinema-service
    B->>R: redlock seat:{showtimeId}:{seatId} × n (TTL 5 min)
    B->>B: INSERT PENDING booking + seat snapshots
    B-->>C: booking + expiresAt

    C->>G: POST /bookings/{id}/pay
    G->>B: PrepareCharge(booking)
    B-->>G: amount, currency, expiry, customer
    G->>P: Charge(context)
    P->>X: create hosted invoice
    P-->>C: checkoutUrl

    C->>X: pay on hosted page
    X->>G: webhook
    G->>P: Webhook(event)
    P->>P: mark payment SETTLED
    P-)B: payment.settled
    B->>R: release seat locks
    B-)T: booking.confirmed (seat + movie snapshot)
    T->>T: issue tickets idempotently
    T-)B: tickets.issued
    B->>B: booking CONFIRMED
    B-)N: payment.received
    T-)N: tickets.issued
    N->>C: ticket + receipt email
```

The important detail is the **paid-but-unticketed** state: a booking stays
`PENDING` with `paid_at` set until `tickets.issued` arrives. If ticket-service
is down, the event stays queued, the UI keeps polling, and no state is lost.
A separate cron re-emits `booking.confirmed` for bookings that never received
`tickets.issued`.

### Two layers against double-booking

| Layer | Mechanism | Nature |
| --- | --- | --- |
| 1 | Redis `redlock` on `seat:{showtimeId}:{seatId}`, TTL = hold window | Fast, best-effort, auto-expiring |
| 2 | `UNIQUE (showtime_id, seat_id)` on `booking_seats` | Hard guarantee enforced by PostgreSQL |

This is a deliberate answer to the Redlock critique: lock safety is not assumed.
If a lock expires during a GC pause, the unique constraint still rejects the
second write. If Redis is unreachable, the request fails closed with `503`
instead of pretending the seat is taken.

### Consistency model, per domain

| Domain | Choice | Rationale |
| --- | --- | --- |
| Seat hold | **CP** | Two customers holding one seat is a business failure; rejecting a request beats accepting both |
| Payment settlement | **CP via DB** | The unique constraint is the final line, even if two paths (webhook + sync) race |
| Catalog browsing | **AP** | A slightly stale movie list is harmless; availability wins |
| Email / telemetry | **AP, eventual** | Duplicate or late email must never fail a settled booking |

This is also a **PACELC** decision: with no partition, CinX chooses low latency
(one Redis quorum, one gRPC call, one insert) and pays for consistency only when
there is a conflict (`409`) or a dependency failure (`503`).

### Failure handling

| Failure | Behavior |
| --- | --- |
| Redis unavailable | Hold fails closed with `503 Seat lock unavailable` |
| Duplicate Xendit webhook | Idempotent handler; no duplicate ticket, no duplicate refund |
| Lost `payment.settled` | `sync-payment` polling repairs the booking when the user returns |
| Lost `booking.confirmed` | Booking confirmation-retry cron republishes the event |
| Lost `tickets.issued` | Booking remains paid-pending; retry cron converges |
| Payment settles after expiry | Booking emits `booking.refund.requested`; no tickets are issued |
| Refund fails at provider | Booking returns to its paid state; tickets stay valid |
| RabbitMQ down | Notification is best-effort; a paid booking is never rolled back for email |
| Duplicate cancel | `REFUND_PENDING` / `REFUNDED` return `409`, so a second refund is never sent |

Refunds follow one rule: **never say `REFUNDED` before the provider says
succeeded.** While `REFUND_PENDING`, the booking is still paid in every way that
matters — the seats stay `BOOKED` and the tickets still admit entry.

### Observability and delivery

- Every backend service exports OTLP traces and metrics to an OTel Collector.
- Tempo stores traces, Prometheus stores metrics, Grafana displays both.
- The Vue client propagates `traceparent`, so a click can be followed through
  gateway → gRPC → event → ticket in a single trace.
- Sampling is set to 20% by default, because observability must not dominate
  the hot path.
- CI validates formatting, lint, unit tests, builds, and both Compose files.
- CD builds eight images and publishes them to GitHub Container Registry.

---

## 5. ERD

Five databases, one per data-owning service. Cross-database references are
**logical** — dotted lines below — and there are no cross-database foreign keys.
`booking_seats` keeps a local FK to `bookings` because both live in
`booking_db`.

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email UK
        varchar name
        varchar password_hash
        enum role
        timestamptz created_at
    }

    MOVIES {
        uuid id PK
        varchar title
        text synopsis
        int duration_minutes
        enum age_rating
        varchar poster_url
        date release_date
        enum status
    }

    GENRES {
        uuid id PK
        varchar name UK
    }

    MOVIE_GENRES {
        uuid movie_id PK
        uuid genre_id PK
    }

    THEATERS {
        uuid id PK
        varchar name
        varchar address
    }

    SEATS {
        uuid id PK
        uuid theater_id FK
        varchar row_label
        int seat_number
        enum category
        boolean is_accessible
        boolean is_disabled
    }

    SHOWTIMES {
        uuid id PK
        uuid movie_id FK
        uuid theater_id FK
        timestamptz starts_at
        bigint price_amount
        char price_currency
    }

    BOOKINGS {
        uuid id PK
        uuid user_id
        uuid showtime_id
        varchar movie_title
        varchar theater_name
        timestamptz starts_at
        bigint total_amount
        enum status
        varchar cancellation_reason
        timestamptz expires_at
        timestamptz paid_at
        timestamptz confirmed_at
        timestamptz tickets_issued_at
    }

    BOOKING_SEATS {
        uuid id PK
        uuid booking_id FK
        uuid showtime_id
        uuid seat_id
        varchar row_label
        int seat_number
        enum category
        bigint price_amount
        char price_currency
    }

    PAYMENTS {
        uuid id PK
        uuid booking_id UK
        varchar external_id
        varchar provider_txn_id
        bigint amount
        enum method
        enum status
        varchar invoice_id
        varchar checkout_url
        varchar refund_id
        timestamptz paid_at
        timestamptz refunded_at
    }

    TICKETS {
        uuid id PK
        uuid booking_id
        uuid user_id
        uuid showtime_id
        varchar code UK
        varchar movie_title
        varchar theater_name
        timestamptz starts_at
        varchar seat_id
        varchar row_label
        int seat_number
    }

    MOVIES ||--o{ MOVIE_GENRES : "tagged with"
    GENRES ||--o{ MOVIE_GENRES : "classifies"
    MOVIES ||--o{ SHOWTIMES : "scheduled as"
    THEATERS ||--o{ SEATS : "contains"
    THEATERS ||--o{ SHOWTIMES : "hosts"
    BOOKINGS ||--|{ BOOKING_SEATS : "includes"
    USERS ||..o{ BOOKINGS : "owns (logical)"
    SHOWTIMES ||..o{ BOOKINGS : "booked for (logical)"
    SEATS ||..o{ BOOKING_SEATS : "snapshot of (logical)"
    BOOKINGS ||..|| PAYMENTS : "paid by (logical)"
    BOOKINGS ||..o{ TICKETS : "issued as (logical)"
```

### Constraints that carry business meaning

| Constraint | Purpose |
| --- | --- |
| `booking_seats UNIQUE (showtime_id, seat_id)` | The hard double-booking guard |
| `bookings.status` enum | `PENDING`, `CONFIRMED`, `EXPIRED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED` |
| `bookings.cancellation_reason` | Separates customer cancellation from payment decline |
| `payments.booking_id UNIQUE` | One payment record per booking |
| `payments.external_id` | Our reference to the provider (`cix-{bookingId}`), not the provider's ID |
| `tickets.code UNIQUE` | Public, human-readable admission code |
| `tickets UNIQUE (booking_id, seat_id)` | One ticket per paid seat, even after a replay |
| `seats UNIQUE (theater_id, row_label, seat_number)` | No duplicate physical seat |
| `showtimes` overlap rule | App-enforced per theater, using movie duration |

### Design notes

- **Snapshots over joins.** Booking records store movie title, theater name,
  start time, and seat/price snapshots. History stays correct even if the
  catalog changes later, and ticket issuance does not depend on cinema-service
  uptime.
- **Availability is derived, never stored.** A seat is `BOOKED` when a
  `CONFIRMED` or `REFUND_PENDING` booking owns it, `HELD` when a `PENDING`
  booking is unexpired and the Redis lock is alive, and `AVAILABLE` otherwise.
  A refunded seat becomes resellable, and the unique guard still permits it
  because the old booking row is reaped on the next hold.
- **Cancellation is not expiry.** `EXPIRED` means the hold lapsed; `CANCELLED`
  means someone decided, with `CUSTOMER` or `PAYMENT_DECLINED` recorded. Mixing
  those loses the difference between funnel abandonment and a payment problem.
- **Payment identifiers are distinct.** `external_id` is ours, `invoice_id` is
  the hosted invoice, and `provider_txn_id` is the provider's settlement ID —
  which may legitimately stay `NULL` for the Invoices API.

---

## 6. Trade-offs

Every architectural choice here has a bill attached. The point is to know what
it costs.

| Decision | What it buys | What it costs | How it is contained |
| --- | --- | --- | --- |
| **Microservices + gRPC** over a modular monolith | Explicit ownership boundaries, independent deploy and scaling, strict contracts | Seven backend processes for one product; more coordination, more failure modes | Typed protos in a shared package, gateway as the only synchronous router |
| **Database per service** | Real data ownership; booking/payment/ticket can evolve without touching cinema | No cross-DB joins or FKs; cannot use one transaction across domains | Logical references, write-time snapshots, gRPC validation before writes |
| **Redis lock + DB constraint** | Fast holds with automatic expiry, and a guarantee that survives lock failure | Two systems to operate; Redis is a single instance in Compose | Fail-closed `503`, unique index as the final fence, idempotent handlers |
| **Asynchronous payments** | Follows the provider instead of blocking the user; handles delayed settlement | Webhooks can be late, duplicated, or lost | Sync-payment polling, retry crons, idempotency, automatic late-settlement refund |
| **RabbitMQ domain events** | Booking, payment, and ticket stay decoupled; one event can fan out | Event contracts, ordering, duplicates, and poison messages become your problem | Durable queues, manual ack, idempotent consumers, retry crons |
| **Saga orchestration** | One place to read the booking lifecycle; one trace end to end | `booking-service` owns saga state and must tolerate duplicate events | Explicit state machine, retry markers, compensating refund step |
| **BFF gateway** | The SPA gets one API shaped for the UI; gRPC stays internal | Extra network hop (~1–5 ms) and an extra component to scale | Stateless gateway, simple aggregation, normalized errors |
| **Seat-map fallback** | The page still renders when booking-service is down | Seats may look available | The server re-validates every seat at hold time |
| **TypeORM `synchronize`** | Fast schema iteration during development | No migration history, unsafe for production | Documented as a limitation; migrations are a planned follow-up |
| **No outbox / DLQ yet** | Simpler system while the event surface is small | A crash between DB commit and publish can lose an event | Reconciliation crons and idempotent replays; outbox + DLQ are explicit next steps |
| **One instance per dependency** | Reproducible local stack, easy demo | No high availability; an outage stops writes | Fail-closed behavior and availability probes; production HA documented separately |

### What I would do differently at production scale

- Add a **transactional outbox** so a database commit and an event publish can
  never disagree, plus a dead-letter queue with bounded retries and alerting.
- Replace `synchronize` with **versioned migrations**, tested backups, and a
  restore drill.
- Run Redis as Sentinel or Cluster and PostgreSQL with a replica/failover
  setup; the current locks and writes assume a single healthy node.
- Publish reproducible benchmark numbers per level, including the knee and the
  bottleneck, rather than only a harness. The k6 suite already supports the
  100 / 500 / 1,000 VU matrix, open-loop reads, contention, and failure
  injection against a mock Xendit.
- Exercise refund and late-settlement paths against Xendit in staging, not only
  against the local mock.

The honest summary: for a real cinema chain, this topology would be
over-engineered at small scale. It exists to demonstrate the boundaries, failure
modes, and consistency reasoning that a high-contention ticketing product
actually needs — and to show those choices can be defended, not just drawn.

---

## 7. Conclusion

CinX is a study in making one invariant impossible to violate: **a seat is
never sold twice, and money never moves without a matching state change.**

The design reaches that through layers rather than trust:

- Redis makes the common case fast and self-expiring.
- PostgreSQL makes the wrong case impossible.
- Snapshots keep history correct across service boundaries.
- Events decouple confirmation and ticketing without losing the booking.
- Retries and reconciliation make asynchronous failures converge instead of
  corrupting state.
- Refunds are compensation, not a status flip: seats and tickets follow the
  money.

The project also demonstrates the less visible half of backend engineering:
typed contracts in a shared package, a stateless BFF, honest `409` versus `503`
semantics, idempotent consumers, trace propagation from browser to event, and a
test strategy that includes unit, integration, browser, and load tests.

The result is not a claim of production readiness. It is a working system with
documented limits, deliberate trade-offs, and a clear list of what should change
before real traffic and real money depend on it.

### Further reading

- [`README.md`](../../README.md) — quick start and booking flow
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — CAP/PACELC analysis and glossary
- [`docs/ERD.md`](../ERD.md) — full column-level data model
- [`docs/openapi.yaml`](../openapi.yaml) — REST contract
- [`CONTEXT.md`](../../CONTEXT.md) — shared domain language
- [`benchmark/README.md`](../../benchmark/README.md) — k6 scenarios and methodology
