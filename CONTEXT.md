# CinX — Booking Context

CinX sells cinema seats. This context covers the journey from browsing a
showtime to holding seats, paying for them, and either receiving tickets or
getting money back. It is the language the codebase and the product should
share; when a term here disagrees with a comment or an identifier, the term
here wins.

## Language

### Catalog

**Movie**:
A film that can be scheduled for screening.
_Avoid_: Film, title, feature

**Theater**:
A physical auditorium owned by the cinema, containing a fixed layout of seats.
_Avoid_: Room, hall, screen, cinema (the cinema is the business, not the room)

**Seat**:
A single position inside a Theater, identified by row and number.
_Avoid_: Position, place

**Showtime**:
One screening of a Movie in a Theater at a specific start time, with its own price.
_Avoid_: Screening, session, performance, event

**Seat Map**:
The seats of one Showtime together with what can be held or bought right now.
_Avoid_: Layout (that is the Theater's static geometry), floor plan

### Reserving

**Booking**:
The reservation of one or more seats for a Showtime, from creation until it
reaches a terminal state. This is the noun: there is no separate thing called
a hold.
_Avoid_: Hold (as a noun), reservation, order, cart, purchase

**Hold**:
The act of claiming seats for a Booking for a bounded window. A hold is
something the system _does_, not something it _has_.
_Avoid_: Hold as a noun ("the hold expired" → "the Booking expired")

**Hold Window**:
The period during which a Booking's seats are exclusively claimed before the
hold lapses unpaid. Currently five minutes.
_Avoid_: TTL, timeout (both are mechanisms, not the domain window)

**Seat Snapshot**:
The immutable copy of a seat — row, number, category, price — taken when the
Booking is created, so a Booking's history survives catalog changes.
_Avoid_: Booking seat (reads as a live seat), reservation line, line item

**Availability**:
Whether a seat of a Showtime can currently be held or bought: `AVAILABLE`,
`HELD` (claimed by a live Booking) or `BOOKED` (paid for).
_Avoid_: Stock, inventory, status (too generic outside a seat's own status)

### Paying

**Payment**:
One attempt to pay for a Booking. A Booking can outlive several attempts.
_Avoid_: Transaction, order, charge when you mean the record

**Charge**:
The act of opening a Payment at the payment provider.
_Avoid_: Checkout (that is the page), invoice (that is the provider's artifact)

**External Reference**:
Our own identifier for a Booking that we hand to the payment provider, so we
can recognise it coming back.
_Avoid_: Provider id (it is _ours_, not the provider's — the old name lied)

**Invoice Id**:
The payment provider's identifier for the hosted invoice the customer pays.
_Avoid_: Payment id, txn id

**Provider Transaction Id**:
The payment provider's identifier for the settled payment itself. Distinct
from the Invoice Id; do not reuse one for the other.
_Avoid_: External id, reference

**Settlement**:
The payment provider confirming that money was actually received. Nothing is
paid until settlement.
_Avoid_: Success, completion, capture

### Ending

**Confirmed**:
The Booking is settled and its tickets have been issued.
_Avoid_: Paid (that describes the Payment, not the Booking), completed

**Expired**:
The Booking's Hold Window lapsed before payment.
_Avoid_: Timed out, abandoned, cancelled

**Cancelled**:
The Booking ended by the customer, or was ended because payment was declined.
The reason is recorded so the two are never conflated again:

- `CUSTOMER` — the customer called it off.
- `PAYMENT_DECLINED` — the provider refused or the attempt lapsed.

_Avoid_: Abandoned, dropped, voided (those are reasons or consequences, not
the state), and never use "cancelled" for a Booking whose hold simply
lapsed — that is Expired

**Refund**:
Returning money for a Confirmed Booking. Refunds are asynchronous, so they
pass through a pending state before they settle:

- **Refund Pending** — the provider has been asked and has not answered. The
  Booking is still Confirmed in every way that matters: the customer's tickets
  still work and the seats are still theirs.
- **Refunded** — the provider returned the money. Terminal: the tickets are
  voided and the seats can be sold again.

_Avoid_: Reversal, credit, chargeback (a different thing entirely)

**Void Ticket**:
A ticket that no longer admits anyone because its Booking was refunded.
_Avoid_: Cancelled ticket, expired ticket

### People

**Customer**:
A person who holds Bookings.
_Avoid_: User (that is the account), client, buyer, passenger

**Admin**:
A person who maintains the catalog — movies, theaters and showtimes.
_Avoid_: Operator, staff, manager
