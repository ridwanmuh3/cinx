# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Moviegoers** — browse now-showing and upcoming movies, choose a showtime at a theater, select and hold seats, pay, and collect tickets. Browsing is open to guests; booking requires sign-in.
- **Cinema administrators** — keep the catalog current by creating, editing, and deleting movies, theaters, and showtimes.

The product is positioned as a real service for actual audiences, not a technology demo. A seeded admin account (`admin@example.com` / `admin1234`) exists for demo/evaluation.

## Product Purpose

A cinema ticketing service where moviegoers discover movies, pick a showtime, select and hold seats, complete payment within a hold window, and receive tickets. An admin area manages the movie/theater/showtime catalog. Success means a smooth, legible booking journey that never double-sells a seat.

## Positioning

Concurrency-safe seat booking: a seat can be held by exactly one person at a time (Redis redlock, 5-minute hold TTL), and issuing tickets after payment is reliable across service boundaries. Seats are never double-booked, and conflicts and expiries are surfaced truthfully (409 on conflicting hold, 410 on confirming a lost/expired hold).

## Operating Context

- Web SPA served at `:4200`, proxying `/api` to a stateless REST gateway (`:3000`).
- Full stack runs via Docker Compose (PostgreSQL 18.4 + Redis 8.10 + gateway + three TCP microservices).
- Payment is a **mock provider**. Checkout exposes "Pay now (success)" and "Simulate failure" affordances; payment retry and hold-expiry states are part of the real flow.
- Seat holds expire after 5 minutes; `PENDING` bookings auto-expire. Payment must complete before expiry.
- Age ratings (`SU`, `BO`, `13+`, `17+`, `21+`) and IDR currency are **incidental seed data**; no specific market is committed.
- A demo walkthrough (`pnpm demo`) drives the full happy path: register, list showtime, hold seats, pay, print ticket codes.

## Capabilities and Constraints

**Capabilities**

- Auth: register, login (JWT Bearer, 1h TTL), roles `user`/`admin`, route guards.
- Movies: browse now-showing / all, movie detail with showtimes and per-theater filter.
- Seat map: seat categories (`REGULAR`/`VIP`/`COUPLE`), accessible and disabled seats, live statuses (`AVAILABLE`/`HELD`/`BOOKED`).
- Booking: hold seats (5-min TTL), checkout with mock payment and retry, cancel pending bookings, booking history, tickets with `TKT-XXXXXX` codes.
- Admin: CRUD for movies, theaters, showtimes.

**Constraints**

- Mock payment only; no real payment provider.
- Hold TTL is 5 minutes; unpaid holds expire and release seats.
- Angular 22 standalone SPA with Tailwind CSS 4; lazy-loaded feature routes; signals-based state.
- Accessibility gate: WCAG AA and clean AXE checks (per `apps/web/AGENTS.md`).
- **Brand name:** CinX (confirmed by the user). Not yet applied in the app: `index.html` title is still "Web" and the shell nav uses the working label "Cinema" — future work should adopt "CinX" as the product name.

## Brand Commitments

- Product name: **CinX** (confirmed). No logo, voice, or personality is established beyond the name; those are open to future definition.

## Evidence on Hand

- REST contract: `docs/openapi.yaml`; relational model: `docs/ERD.md`; build phases and design notes: `PLAN.md`.
- Playwright e2e specs in `apps/web/e2e/` covering the seat flow, checkout/payment, and admin CRUD.
- Demo walkthrough script: `scripts/demo-walkthrough.sh` (`pnpm demo`).
- Seeded cinema catalog and admin credentials.
- No marketing copy, testimonials, or external customer evidence exists; none may be fabricated.

## Product Principles

1. **Correctness over speed.** A seat is sold exactly once; holds, conflicts, and expiry must be shown truthfully in the UI at every step.
2. **Read-first browsing.** Discovery is open to guests; accounts matter only at the point of booking.
3. **Tight booking arc.** Discover → showtime → seats → pay → tickets stays short and legible, with clear state at each step.
4. **Plain, reliable admin tools.** Catalog editing is a utility for the operator, not a spectacle.
5. **Technical quality is a product promise.** WCAG AA / AXE-clean accessibility, responsive layout, and production-grade frontend code are non-negotiable.

## Accessibility & Inclusion

- WCAG AA minimums and clean AXE checks are required by the app's engineering standards.
- The seat map must stay usable with assistive technology: accessible and disabled seating are explicit data (`isAccessible`/`isDisabled`) and must be surfaced in the UI.
