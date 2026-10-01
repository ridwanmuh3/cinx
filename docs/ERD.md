# ERD — Ticketing Cinema (relational model)

PostgreSQL 18 model, one database per service. Maps 1:1 to TypeORM entities.

```
users ──< bookings >── booking_seats >── seats >── theaters
                 ││         │
                 ││         └──< showtimes >── movies >── movie_genres >── genres
                 ││
                 ├──1:1── payments
                 └──< tickets
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

## ticket_db — ticket-service

### bookings
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL (logical ref → user_db.users) |
| showtime_id | uuid | NOT NULL (logical ref → cinema_db.showtimes) |
| total_amount | bigint | NOT NULL |
| currency | char(3) | NOT NULL, default `IDR` |
| status | enum `PENDING` `CONFIRMED` `EXPIRED` `CANCELLED` `REFUND_PENDING` `REFUNDED` | NOT NULL, default `PENDING` |
| cancellation_reason | varchar(32) | NULL (`CUSTOMER` \| `PAYMENT_DECLINED`); set only when status = `CANCELLED` |
| expires_at | timestamptz | NOT NULL (hold deadline) |
| created_at / updated_at | timestamptz | NOT NULL |

INDEX `(user_id, created_at)`, `(showtime_id, status)`

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

UNIQUE `(booking_id, seat_id)`, UNIQUE `(showtime_id, seat_id)` ← hard double-booking guard

### payments
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| booking_id | FK → bookings | UNIQUE (1:1) |
| external_id | varchar(200) | INDEX, NOT NULL (our reference: `cix-{bookingId}`) |
| method | enum `XENDIT` | NOT NULL |
| status | enum `PENDING` `PAID` `FAILED` `REFUND_PENDING` `REFUNDED` | NOT NULL, default `PENDING` |
| amount | bigint | NOT NULL |
| currency | char(3) | NOT NULL |
| paid_at | timestamptz | NULL |
| invoice_id | varchar(200) | NULL (Xendit invoice) |
| checkout_url | varchar(1024) | NULL |
| refund_id | varchar(200) | NULL (Xendit `rfd-…`) |
| refunded_at | timestamptz | NULL |
| created_at / updated_at | timestamptz | NOT NULL |

### tickets
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| booking_id | FK → bookings | CASCADE |
| showtime_id | uuid | NOT NULL (logical ref) |
| seat_id | uuid | NOT NULL (logical ref) |
| code | varchar(10) | UNIQUE, NOT NULL (`TKT-XXXXXX`) |
| movie_title | varchar(200) | NOT NULL (snapshot) |
| theater_name | varchar(100) | NOT NULL (snapshot) |
| starts_at | timestamptz | NOT NULL (snapshot) |
| created_at | timestamptz | NOT NULL |

UNIQUE `(showtime_id, seat_id)`

## Cross-service notes
- `seat_id` / `showtime_id` / `user_id` in ticket_db are **logical references,
  not FKs** — referenced tables live in other databases. Seat row/number/category
  and movie/theater names are snapshotted on write (immutable records).
- Availability is **derived, never stored**: seat X for showtime S =
  - `BOOKED` → booking_seats(S, X) with booking `CONFIRMED` or
    `REFUND_PENDING` (a refund in flight still owns its seats)
  - `HELD` → booking `PENDING` with `expires_at > now` (live Redis lock
    `seat:{showtimeId}:{seatId}` is the authority)
  - `AVAILABLE` → otherwise (including `REFUNDED`; the freed seat row is
    reaped on the next hold, which is why the UNIQUE guard still lets it resell)
- **Tickets have exactly one writer:** they are issued by ticket-service when a
  Booking is confirmed (`IssueTickets`, idempotent). Reading a booking uses
  `ListTickets`, which never writes — a read must not create domain state.
- **Payment references:** `external_id` is *our* reference handed to the
  provider (`cix-{bookingId}`); `invoice_id` is the provider's invoice id;
  `provider_txn_id` is the provider's settlement id and stays NULL here,
  because the Invoices API never returns a separate transaction id — filling
  it with the invoice id would just duplicate `invoice_id`.
- **Cancellation vs expiry:** `EXPIRED` means the hold window lapsed — nobody
  decided anything. `CANCELLED` means someone did, and
  `cancellation_reason` records who: `CUSTOMER` (they called it off) or
  `PAYMENT_DECLINED` (the provider refused). Conflating the two loses the
  difference between funnel abandonment and a payment problem.
- **Notification** is derived from booking state, never stored: on
  confirmation ticket-service publishes `booking.confirmed` and
  `payment.received` to the RabbitMQ fanout exchange, and
  notification-service turns them into email. Delivery is best-effort — a
  dead broker must never fail a settled Booking.
- **Refunds** are a saga compensation, not a status flip: `CONFIRMED` +
  `cancel` requests a Xendit refund. It settles synchronously to `REFUNDED`
  (tickets voided, seats resellable) or stays `REFUND_PENDING` until the
  reconcile cron polls it; a provider `FAILED` reverts the booking to
  `CONFIRMED`, because the money never moved.
