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
| status | enum `PENDING` `CONFIRMED` `EXPIRED` `CANCELLED` | NOT NULL, default `PENDING` |
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
| provider_id | varchar(64) | UNIQUE, NOT NULL (e.g. `pay_01J2`) |
| method | enum `MOCK` | NOT NULL |
| status | enum `PENDING` `PAID` `FAILED` | NOT NULL, default `PENDING` |
| amount | bigint | NOT NULL |
| currency | char(3) | NOT NULL |
| paid_at | timestamptz | NULL |
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
  - `BOOKED` → booking_seats(S, X) with booking `CONFIRMED`
  - `HELD` → booking `PENDING` with `expires_at > now` (live Redis lock
    `seat:{showtimeId}:{seatId}` is the authority)
  - `AVAILABLE` → otherwise
