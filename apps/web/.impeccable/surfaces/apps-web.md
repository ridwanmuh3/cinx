---
version: 1
slug: 'apps-web'
primary_target: 'apps/web/src/pages/landing/ui/LandingPage.vue'
related_targets:
  [
    'apps/web/src/app/landing.css',
    'apps/web/src/app/styles.css',
    'apps/web/src/app/router.ts',
    'apps/web/src/shared/ui/ThemeToggle.vue',
    'apps/web/index.html',
  ]
---

# Landing surface brief — CinX (Showtime Board world)

Product: CinX cinema ticketing SPA built with Vue 3, Vue Router, Pinia, Vite, and Tailwind CSS 4. `apps/web/src/pages/landing/ui/LandingPage.vue` renders `/`; `apps/web/src/app/router.ts` defines the movie, authentication, booking, and admin routes, with authentication guards on protected routes. `apps/web/src/app/main.ts` imports `styles.css` and `landing.css`.

World: **The Showtime Board** (direction index 7, seed 6b5f6499). Every surface is a lit departure board: near-black matte panels (#08080a ink / #0e0e12 panels), amber (#ffb52e) action color, DotGothic16 board voice for all data/labels, Schibsted Grotesk headings, Manrope body, phosphor-green (#5aff9a) LIVE marks. Rows/columns/tickers ruled like a departure display; corner-bracket panel motif; sharp 0-radius corners; depth = soft offset shadow + zero-offset glow (no bevels, no block shadows).

Theme: dark is the fallback default (night-cinema); a light "daylight matinee" variant (cream paper #f6f1e8, ink text, split amber text/fill) flips via `data-theme` on `<html>` with a toggle in the board bar + shell + auth cards, persisting to `localStorage` `cinx-theme` and otherwise following `prefers-color-scheme`.

First viewport: sticky board bar (CINX lockup + LIVE/DEMO chip, theme toggle, scroll links, Book now) above a hero whose right side is a showtime board: "Tonight at CinX", marquee ticker, illustrative "Seat G7 held for you" with a ticking countdown, a ruled 6-column showtime grid (featured row with poster + NOW chip), foot "5:00 hold · TKT-XXXXXX". Lede "Book a cinema seat in under a minute… never sold twice", Book now / How it works, proof list. The hero countdown is a demo animation, not an actual reservation.

Sections (all present & verified): How it works (4 steps, distinct mini-artifacts), Theaters & seats (interactive 8×12 seat map, REGULAR/VIP/COUPLE tiers, demo-rate note), FAQ (single-open accordion), final board CTA, footer.

Board data: `LandingPage.vue` loads showtimes and now-playing movies through `@/shared/api`; when no showtimes load, it switches to clearly labeled DEMO BOARD rows. Rows with real showtime IDs link to seat selection; demo rows link to the movie catalog.

Truth guardrails: the interactive landing seat map is a demo, not the bookable seat map. Keep payment copy aligned with the current checkout implementation (`CheckoutPage.vue` redirects to Xendit); landing FAQ/footer still mention mock payment and must not be treated as current payment truth. Do not invent availability, completed holds, or payment outcomes.

Verification status: earlier build, Playwright, overflow, and console results do not verify the current Vue implementation. Recheck Vue build, booking flow, keyboard/touch targets, and mobile spacing in a running browser before claiming them. The current design detector reports typography-ramp advisories in `landing.css` and `styles.css`.
