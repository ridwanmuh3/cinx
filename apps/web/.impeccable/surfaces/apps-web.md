---
version: 1
slug: 'apps-web'
primary_target: 'apps/web'
related_targets:
  [
    'apps/web/src/app/features/landing/landing.html',
    'apps/web/src/app/features/landing/landing.component.ts',
    'apps/web/src/landing.css',
    'apps/web/src/index.html',
  ]
---

# Landing surface brief — CinX (Showtime Board world)

Product: CinX cinema ticketing SPA (apps/web Angular surface). Landing route added at `/` (pathMatch full), previous root behavior unchanged (guards redirect to /movies /login; e2e specs use explicit URLs).

World: **The Showtime Board** (direction index 7, seed 6b5f6499). Every surface is a lit departure board: near-black matte panels (#08080a ink / #0e0e12 panels), amber (#ffb52e) action color, DotGothic16 board voice for all data/labels, Schibsted Grotesk headings, Manrope body, phosphor-green (#5aff9a) LIVE marks. Rows/columns/tickers ruled like a departure display; corner-bracket panel motif; sharp 0-radius corners; depth = soft offset shadow + zero-offset glow (no bevels, no block shadows).

Theme: dark is the fallback default (night-cinema); a light "daylight matinee" variant (cream paper #f6f1e8, ink text, split amber text/fill) flips via `data-theme` on `<html>` with a toggle in the board bar + shell + auth cards, persisting to `localStorage` `cinx-theme` and otherwise following `prefers-color-scheme`.

First viewport: sticky board bar (CINX lockup + LIVE/DEMO chip, theme toggle, scroll links, Book now) above a hero whose right side IS a live board: "Tonight at CinX", marquee ticker, "Seat G7 held for you" with a ticking 4:59 countdown, a ruled 6-column showtime grid (featured row with poster + NOW chip), foot "5:00 hold · TKT-XXXXXX". Lede "Book a cinema seat in under a minute… never sold twice", Book now / How it works, proof list.

Sections (all present & verified): How it works (4 steps, distinct mini-artifacts), Theaters & seats (interactive 8×12 seat map, REGULAR/VIP/COUPLE tiers, demo-rate note), FAQ (single-open accordion), final board CTA, footer.

Board data: loads real showtimes via ApiService resource with 4s timeout; falls back to clearly-labeled DEMO BOARD rows when the API is unreachable.

Truth guardrails honored: demo auditorium labeled, mock payment noted, no invented claims; seat G7 is a real VIP seat on the map.

Verification: build green; detector clean (overused-font warning cleared by swapping to Schibsted Grotesk + Manrope; only pre-existing font-size advisories remain); computed styles confirm light palette (bg #f6f1e8, text #1d1a12, amber-fill #f0a500 / on-amber #1d1a12 AA) and Schibsted Grotesk headings + Manrope body + DotGothic16 data; Playwright e2e 7/7 (admin, checkout-payment, seat-flow); light/dark toggle flips `data-theme`, persists via `localStorage['cinx-theme']`; no horizontal overflow on 390px (Sign in ghost link hidden ≤560px); zero real console errors.
