# ERD — Ticketing Cinema (relational model)

PostgreSQL 18 model, one database per service. Maps 1:1 to TypeORM entities.

```
user_db.users ──< booking_db.bookings >── booking_db.booking_seats
                                      │  (logical refs, no cross-DB FK)
                                      ├──1:1── payment_db.payments
                                      └──< tickets  (ticket_db.tickets)

cinema_db: theaters ──< seats
           theaters ──< showtimes >── movies >── movie_genres >── genres
```

## user_db — user-service

### users
| column | type | constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| email | varchar(255) | UNIQUE, NOT NULL |
| name | varchar(100) | NULL |
| password_hash | varchar(255) | NOT NULL |
| role | enum `admin` `user` | NOT NULL, default `user` |
| created_at / updated_at | timestamptz | NOT NULL |

## cinema_db — cinema-service

### movies
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| title | varchar(200) | NOT NULL |
| synopsis | text | NOT NULL |
| duration_minutes | int | NOT NULL |
| age_rating | enum `SU` `BO` `13+` `17+` `21+` | NOT NULL |
| poster_url | varchar(512) | NULL |
| release_date | date | NOT NULL |
| status | enum `NOW_SHOWING` `COMING_SOON` `ENDED` | NOT NULL, default `NOW_SHOWING` |
| created_at / updated_at | timestamptz | NOT NULL |

### genres
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| name | varchar(50) | UNIQUE, NOT NULL |

### movie_genres
| column | type | constraints |
|---|---|---|
| movie_id | FK → movies | PK part, CASCADE |
| genre_id | FK → genres | PK part, CASCADE |

PK `(movie_id, genre_id)`

### theaters
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| name | varchar(100) | NOT NULL |
| address | varchar(300) | NOT NULL |
| created_at / updated_at | timestamptz | NOT NULL |

### seats
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| theater_id | FK → theaters | CASCADE |
| row_label | varchar(2) | NOT NULL |
| seat_number | int | NOT NULL |
| category | enum `REGULAR` `VIP` `COUPLE` | NOT NULL, default `REGULAR` |
| is_accessible | boolean | NOT NULL, default false |
| is_disabled | boolean | NOT NULL, default false |
| created_at / updated_at | timestamptz | NOT NULL |

UNIQUE `(theater_id, row_label, seat_number)`

### showtimes
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| movie_id | FK → movies | RESTRICT |
| theater_id | FK → theaters | RESTRICT |
| starts_at | timestamptz | NOT NULL |
| price_amount | bigint | NOT NULL (IDR, no decimals) |
| price_currency | char(3) | NOT NULL, default `IDR` |
| created_at / updated_at | timestamptz | NOT NULL |

INDEX `(movie_id, starts_at)`, `(theater_id, starts_at)`
No-overlap rule per theater is app-enforced.

## booking_db — booking-service

### bookings
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL (logical ref → user_db.users) |
| showtime_id | uuid | NOT NULL (logical ref → cinema_db.showtimes) |
| movie_title | varchar(200) | NOT NULL (snapshot at hold) |
| theater_name | varchar(200) | NOT NULL (snapshot at hold) |
| starts_at | timestamptz | NOT NULL (snapshot at hold) |
| total_amount | bigint | NOT NULL |
| price_currency | char(3) | NOT NULL, default `IDR` |
| status | enum `PENDING` `CONFIRMED` `EXPIRED` `CANCELLED` `REFUND_PENDING` `REFUNDED` | NOT NULL, default `PENDING` |
| cancellation_reason | varchar(32) | NULL (`CUSTOMER` \| `PAYMENT_DECLINED`); set only when status = `CANCELLED` |
| expires_at | timestamptz | NOT NULL (hold deadline) |
| paid_at | timestamptz | NULL (`payment.settled` received) |
| confirmed_at | timestamptz | NULL |
| tickets_issued_at | timestamptz | NULL (`tickets.issued` received) |
| confirmation_attempted_at | timestamptz | NULL (confirmation retry marker) |
| refund_requested_at | timestamptz | NULL (refund command retry marker) |
| created_at / updated_at | timestamptz | NOT NULL |

INDEX `(status)`, `(user_id)`, `(paid_at)`

### booking_seats
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| booking_id | FK → bookings | CASCADE |
| showtime_id | uuid | NOT NULL (logical ref, denormalized for the guard) |
| seat_id | uuid | NOT NULL (logical ref → cinema_db.seats) |
| row_label | varchar(2) | NOT NULL (snapshot) |
| seat_number | int | NOT NULL (snapshot) |
| category | enum `REGULAR` `VIP` `COUPLE` | NOT NULL (snapshot) |
| price_amount | bigint | NOT NULL (snapshot) |
| price_currency | char(3) | NOT NULL (snapshot) |

UNIQUE `(showtime_id, seat_id)` ← hard double-booking guard

## payment_db — payment-service

### payments
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| booking_id | uuid | UNIQUE, NOT NULL (logical ref → booking_db.bookings) |
| external_id | varchar(200) | INDEX, NOT NULL (our reference: `cix-{bookingId}`) |
| provider_txn_id | varchar(200) | NULL (provider settlement id; often NULL for Invoices) |
| amount | bigint | NOT NULL |
| price_currency | char(3) | NOT NULL, default `IDR` |
| method | enum `XENDIT` | NOT NULL |
| status | enum `PENDING` `PAID` `FAILED` `REFUND_PENDING` `REFUNDED` | NOT NULL, default `PENDING` |
| paid_at | timestamptz | NULL |
| invoice_id | varchar(200) | NULL (Xendit invoice) |
| checkout_url | varchar(1024) | NULL |
| receipt_url | varchar(512) | NULL |
| refund_id | varchar(200) | NULL (Xendit `rfd-…`) |
| refunded_at | timestamptz | NULL |
| created_at / updated_at | timestamptz | NOT NULL |

INDEX `(status)`, UNIQUE `(booking_id)`, `(external_id)`

## ticket_db — ticket-service

### tickets
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| booking_id | uuid | NOT NULL (logical ref → booking_db.bookings) |
| user_id | uuid | NOT NULL (logical ref → user_db.users) |
| showtime_id | uuid | NOT NULL (logical ref → cinema_db.showtimes) |
| code | varchar(16) | UNIQUE, NOT NULL (`TKT-XXXXXXXX`) |
| movie_title | varchar(200) | NOT NULL (snapshot from event) |
| theater_name | varchar(200) | NOT NULL (snapshot from event) |
| starts_at | timestamptz | NOT NULL (snapshot from event) |
| seat_id | varchar(100) | NOT NULL (logical ref) |
| row_label | varchar(2) | NOT NULL (snapshot) |
| seat_number | int | NOT NULL (snapshot) |
| created_at | timestamptz | NOT NULL |

INDEX `(booking_id)`, UNIQUE `(booking_id, seat_id)`, UNIQUE `(code)`

## Cross-service notes
- There are **no cross-database foreign keys**. `user_id`, `showtime_id`,
  `seat_id`, and `booking_id` are logical references; each service joins only
  inside its own database. `booking_seats` keeps a local FK to `bookings`
  because both live in `booking_db`.
- Booking-service snapshots movie/theater/start at hold time, then includes
  them in `booking.confirmed`. Ticket-service stores its own copy. This keeps
  confirmation and ticket issuance independent of cinema-service uptime.
- Availability is **derived in booking-service, never stored**: seat X for
  showtime S =
  - `BOOKED` → booking_seats(S, X) on a booking with `CONFIRMED` or
    `REFUND_PENDING` (a refund in flight still owns its seats)
  - `HELD` → booking `PENDING` with `expires_at > now` and a live Redis lock
    `seat:{showtimeId}:{seatId}`
  - `AVAILABLE` → otherwise (including `REFUNDED`; the freed seat row is
    reaped on the next hold, which is why the UNIQUE guard still lets it resell)
- **Tickets have exactly one writer:** ticket-service consumes
  `booking.confirmed` and issues tickets idempotently. It never reads
  booking_db. `ListTickets` is a pure read.
- **Payment references:** `external_id` is *our* reference handed to the
  provider (`cix-{bookingId}`); `invoice_id` is the provider's invoice id;
  `provider_txn_id` is the provider's settlement id and may stay NULL,
  because the Invoices API never returns a separate transaction id.
- **Cancellation vs expiry:** `EXPIRED` means the hold window lapsed — nobody
  decided anything. `CANCELLED` means someone did, and
  `cancellation_reason` records who: `CUSTOMER` (they called it off) or
  `PAYMENT_DECLINED` (the provider refused). Conflating the two loses the
  difference between funnel abandonment and a payment problem.
- **Notification is derived, never stored:** booking-service publishes
  `booking.confirmed` (with the resolved recipient) and `payment.received`;
  ticket-service publishes `tickets.issued`. notification-service consumes
  them from the `ticketing.internal` topic exchange. Delivery is best-effort —
  a dead broker must never fail a settled booking.
- **Refunds are a saga compensation, not a status flip:** `CONFIRMED` +
  cancel moves booking to `REFUND_PENDING` and payment-service asks Xendit for
  a refund. `payment.refunded` moves booking to `REFUNDED` and makes
  ticket-service void the tickets. A provider failure emits
  `payment.refund_failed`, and booking returns to `CONFIRMED` because the
  money never moved.
- **Late settlement:** `payment.settled` for an `EXPIRED`/`CANCELLED` booking
  triggers `booking.refund.requested`; ticket issuance never happens because
  booking never emits `booking.confirmed`.
