---
name: CinX
description: Cinema tickets, held for you — a live showtime-board world
colors:
  ink: '#08080a'
  ink-panel: '#0e0e12'
  ink-panel-high: '#15151b'
  bone: '#ece9e1'
  bone-dim: '#a6a29a'
  amber: '#ffb52e'
  amber-hot: '#ffc75e'
  amber-dim: '#d18f1b'
  signal-green: '#5aff9a'
  signal-red: '#ff5d5d'
  ink-line: 'rgba(236, 233, 225, 0.14)'
  ink-line-soft: 'rgba(236, 233, 225, 0.07)'
  amber-soft: 'rgba(255, 181, 46, 0.16)'
  light:
    bg: '#f6f1e8'
    panel: '#fffdf9'
    panel-high: '#ffffff'
    text: '#1d1a12'
    text-dim: '#5d5748'
    amber: '#9a6f00'
    amber-fill: '#f0a500'
    green: '#0e8a4c'
    red: '#c2311f'
    line: 'rgba(29, 26, 18, 0.16)'
    line-soft: 'rgba(29, 26, 18, 0.08)'
typography:
  display:
    fontFamily: "'Schibsted Grotesk', 'Manrope', system-ui, sans-serif"
    fontSize: 'clamp(2.6rem, 7vw, 4.4rem)'
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: '-0.015em'
  headline:
    fontFamily: "'Schibsted Grotesk', 'Manrope', system-ui, sans-serif"
    fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.01em'
  title:
    fontFamily: "'Schibsted Grotesk', 'Manrope', system-ui, sans-serif"
    fontSize: '19px'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.01em'
  body:
    fontFamily: "'Manrope', system-ui, sans-serif"
    fontSize: '14.5px'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 'normal'
  label:
    fontFamily: "'DotGothic16', 'Courier New', monospace"
    fontSize: '10px'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: '0.14em'
    textTransform: 'uppercase'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '40px'
  section: '88px'
components:
  button-primary:
    backgroundColor: '{colors.amber}'
    textColor: '#120c00'
    rounded: '0px'
    padding: '14px 24px'
  button-primary-lg:
    backgroundColor: '{colors.amber}'
    textColor: '#120c00'
    rounded: '0px'
    padding: '16px 32px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.bone}'
    rounded: '0px'
    padding: '14px 24px'
  seat-available:
    backgroundColor: 'transparent'
    rounded: '0px'
    size: '100%'
  seat-selected:
    backgroundColor: '{colors.amber}'
    rounded: '0px'
  seat-held:
    backgroundColor: '{colors.amber-soft}'
  seat-booked:
    backgroundColor: 'rgba(236, 233, 225, 0.06)'
  board-panel:
    backgroundColor: '{colors.ink-panel}'
    rounded: '0px'
    padding: '18px'
---

# Design System: CinX

## Overview

**Creative North Star: "The Showtime Board"**

CinX is a cinema ticketing service where the schedule board is the product, not a decoration. Every surface is a lit departure board at the cinema: near-black matte panels, amber dot-matrix lettering, bone-white body text, phosphor-green "live" marks, and rows, columns, and tickers ruled with the precision of an arrivals display. The hero refuses the dark-poster-grid cinema trope; instead the hero IS a live showtime board with a ticking seat-hold countdown, so a first-time visitor reads the entire offer in one scan — this books seats, holds them for five minutes, and never double-sells.

The density is informational and mechanical: uppercase dot-matrix labels, ruled column headers, ticker tape, blinking live dots, corner-bracketed panels. Personality comes from the board's own grammar (glow, pulse, countdown, NOW chips), never from decorative flourish. The palette is night-cinema dark with a single warm amber accent that carries all primary actions, a phosphor green reserved for "live/available" signals, and bone-white for text on the matte black.

**Key Characteristics:**

- Every surface is a board: panels carry the corner-bracket motif, ruled borders, and dot-matrix labels of a departure display.
- Amber is the single action color; it never competes with the green "live" signal.
- Type is two voices: DotGothic16 for all data/board/labels, Schibsted Grotesk for headings, Manrope for long-form body reading (readability upgrade).
- Sharp corners throughout (0 radius); depth comes from soft ambient shadow and glow, never from bevels or offset block shadows.
- Motion is the board's own: ticker scroll, dot-pulse blink, hold countdown, row reveal, cursor blink — one authored moment per mechanism, never scattered.

## Colors

The palette is night-cinema dark on matte, with amber as the single action accent, phosphor green as the "live/available" signal, and bone-white text. Secondary/tertiary roles are deliberately not used; the world has two accents and one neutral family.

### Primary

- **Amber** (#ffb52e): The single action color — primary buttons, selected seats, hold labels, NOW chips, brand mark, accent text. On dark ink it carries contrast 11.9:1 and is always the thing to press or the thing being held.
- **Amber Hot** (#ffc75e): Hover lift for primary actions.
- **Amber Dim** (#d18f1b): Borders and accents that must recede — board corner brackets, held-seat borders, chip outlines.

### Secondary

- **Signal Green** (#5aff9a): Phosphor "live/available" — the LIVE/DEMO status, available seat outlines, the proof-list dots. Used only for signals, never for actions.
- **Signal Red** (#ff5d5d): Reserved for failures/errors in the booking flow (not on the landing surface itself).

### Neutral

- **Ink** (#08080a): Page background — the night-cinema dark.
- **Ink Panel** (#0e0e12): Board/tier/seat-map panel background (one step above ink).
- **Ink Panel High** (#15151b): Top-lit gradient stop on boards.
- **Bone** (#ece9e1): Primary text — headlines, board lettering, active text.
- **Bone Dim** (#a6a29a): Secondary text and labels (8.26:1 on ink — AA-safe for small text).
- **Ink Line** (rgba(236,233,225,0.14)): Ruled borders between board rows and sections.
- **Ink Line Soft** (rgba(236,233,225,0.07)): Divider hairline within panels.

### Named Rules

**The Single Amber Rule.** Amber is the only action color and it is used sparingly — primary buttons, selected/held states, the brand mark. When something must "press" or is "held", it is amber; everything else stays neutral. Rarity is the point.
**The Green Means Live Rule.** Phosphor green is a signal, never an action. Green says "this is happening now / this seat is available"; it never carries a button.

## Typography

**Display Font:** Schibsted Grotesk (fallback Manrope, system-ui, sans-serif)
**Body Font:** Manrope (fallback system-ui, sans-serif)
**Label/Mono Font:** DotGothic16 (all data: numbers, times, prices, ticket codes, uppercase labels)

**Character:** Headings are set in Schibsted Grotesk — a sharp, upright grotesque whose squared, mechanical letterforms keep the departure-board energy while reading far more comfortably than a dot-matrix face. Body copy is set in Manrope, a highly legible geometric-grotesque with an open, tall x-height tuned for long-form reading. DotGothic16 remains the board's native data voice for every number, label, and ticker, so monospace still means data and measurement, never a "technical" costume.

### Hierarchy

- **Display** (800, clamp(2.6rem, 7vw, 4.4rem), 1.05, -0.015em): The hero headline — short, two-line, weight carried by size and color.
- **Headline** (700, clamp(1.6rem, 3.4vw, 2.3rem), 1.12): Section titles, final-CTA title. Set in the display face with balanced wrapping.
- **Title** (700, 19px, 1.3): Step and card titles in the display face.
- **Body** (400, 14.5px, 1.6): Long-form copy in Manrope; color text-dim. Measures 54–72ch where set.
- **Label** (400, 10px, 0.14em, uppercase): Board headers, column labels, chip text, footer titles, tier names — always uppercase DotGothic16.

### Named Rules

**The Board Voice Rule.** Numbers, times, prices, seat counts, ticket codes, and all uppercase labels are set in DotGothic16 with tabular-nums behavior where they tick. The display face is never used for body-length copy, and the body face is never used for data.

## Light Theme (daylight matinee)

A `data-theme="light"` variant renders the same departure board on bright cream
box-office stock — the physical scene is a daytime ticket lobby on paper, so
ink text, amber stamping and ruled rows replace the night-cinema matte. Tokens
flip via `[data-theme='light']` overrides in `styles.css` (and inherited by the
scoped landing.css). Dark is the fallback default; a manual toggle persists to
`localStorage` (`cinx-theme`) and otherwise follows `prefers-color-scheme`.

- Backgrounds: `#f6f1e8` page, `#fffdf9` panels, `#ffffff` raised.
- Text: `#1d1a12` primary, `#5d5748` secondary (AA on paper).
- Amber splits into two roles: `--amber` `#9a6f00` for text/borders (AA on paper)
  and `--amber-fill` `#f0a500` for action fills (buttons, selected seats) paired
  with near-black `--on-amber` text.
- Glows are softened (`--amber-glow` dimmed) because colored halos read weakly on
  paper; depth still comes from soft offset shadows only.
- All other grammar — 0 radius, corner brackets, ruled rows, the Halo Not Shadow
  rule, green-live / amber-action — is unchanged.

## Layout

Content runs in a single 1160px column with 24px side padding, sections separated by 1px ruled borders and 88px vertical padding. The hero is a two-column grid at ≥900px (5fr copy / 6fr board) that collapses to stacked on mobile. Sections carry `scroll-margin-top: 72px` to land under the sticky board bar.

Spacing rhythm: tight clusters of 4–16px within panels, 24–48px between elements, 88px between sections. The board interior uses a 6-column ruled grid (film / time / screen / seats / price / action) with 10px gutters on desktop; below 560px the fixed tracks shrink (36/40/26/38/44px) with 6px gutters so the board never overflows a 390px viewport.

Breakpoints: board rows compact at ≤560px, hero goes two-column at ≥900px, seats-layout two-column at ≥960px, steps go 4-up at ≥860px, footer grid goes 4-up at ≥820px.

## Elevation & Depth

A hybrid: surfaces are flat at rest (no bevels, no block shadows), and depth is drawn with soft ambient shadow plus a signature glow. The board panel lifts with a large soft drop (`0 30px 80px -30px rgba(0,0,0,0.8)`) and an inner top highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`); the featured board row carries an inset amber left mark. All "lit" elements (seats, dots, countdowns) use a zero-offset colored glow (`box-shadow: 0 0 8px`/`12px`/`18px`) — a halo that reads as light, never as depth.

### Shadow Vocabulary

- **Board drop** (`0 30px 80px -30px rgba(0,0,0,0.8)`): The board panel floats off the ink background.
- **Panel inner** (`inset 0 1px 0 rgba(255,255,255,0.04)`): Top highlight on boards.
- **Featured mark** (`inset 2px 0 0 var(--amber)`): Left marker on the now-showing board row.
- **Seat glow** (`0 0 12px rgba(255,181,46,0.55)`): Selected seats.
- **Signal glow** (`0 0 6px/8px currentColor`): Live dots and hover states.

### Named Rules

**The Halo Not Shadow Rule.** Light is a colored glow with zero offset; depth is a soft blur with offset. A hard offset block shadow is foreign to this world and never appears — this is not neobrutalist, and a costume block-shadow is a violation.

## Shapes

Fully rectangular: 0 radius everywhere — panels, buttons, seats, chips. Corners are enforced with the board's corner-bracket motif (1px amber-dim brackets on the board panel's top-left and bottom-right). Seats are small rounded rects (`aspect-ratio: 1 / 1.1`) that read as discrete buttons on the grid, not furniture silhouettes. The screen-arc is the one curved silhouette — a 180° arc labeled "Screen" above the seat map.

## Components

### Buttons

- **Shape:** Rectangular (0 radius).
- **Primary:** Amber background, near-black text (#120c00), mono or sans per context. Landing CTAs use `14px 24px` (lg: `16px 32px`); board row "Book" uses a compact `btn-xs` (`6px 10px`, 11px). Hover lifts to amber-hot.
- **Ghost:** Transparent, 1px amber-dim outline, bone text; hover brightens outline to amber. Secondary hero CTA.
- **Hover / Focus:** Transitions 0.16–0.2s ease; focus shows a 2px amber outline. Buttons are blocky and press-ready, matching the board console.

### Chips

- **NOW / LIVE / DEMO:** DotGothic16 9–10px uppercase with 0.1–0.14em tracking. LIVE/SYNCING is signal green with a blinking dot-pulse; DEMO is amber. Now-chip is amber-filled with near-black text.

### Board Panel (signature)

- **Structure:** Dark gradient panel (`#15151b → #0e0e12`), 1px line border, corner brackets, 18px padding. Contains head (title + status), ticker strip, hold strip with countdown, a ruled 6-column grid of showtimes, and a foot line. The featured row is gradient-highlighted with an inset amber left mark.

### Seat Map (signature)

- **Grid:** 8 rows × 12 columns of seat buttons, plus a screen arc. Seat states: available (outline), selected (amber fill + glow), held (amber-soft fill, amber-dim border, not-allowed), booked (bone-tint fill, muted), VIP (green-tinted outline), COUPLE (green dashed), accessible (amber-dashed with corner dot). A legend maps swatches to states.

### FAQ

- Ruled rows with a 16px amber plus-icon that rotates 45° when open; panel opens via `grid-template-rows: 0fr → 1fr` (0.28s ease). Single-open accordion.

### Navigation

- Sticky board bar: brand lockup (amber mark + CINX), scroll links (How it works / Theaters & seats / FAQ), ghost "Sign in", amber "Book now". Bar is ink with a bottom rule and a subtle backdrop blur.

## Do's and Don'ts

### Do:

- **Do** set every number, time, price, seat label, and uppercase board label in DotGothic16.
- **Do** reserve amber for the single action or the held/selected state, and green for live/available signals.
- **Do** keep corners at 0 radius and rule surfaces with 1px line borders and the corner-bracket motif.
- **Do** express light as zero-offset colored glow, and depth as soft offset shadow with blur.

### Don't:

- **Don't** use a dark-poster-grid cinema hero — the schedule board IS the hero, with a live hold countdown.
- **Don't** use hard offset block shadows, bevels, or embossed material — the world is matte boards, not stamped metal.
- **Don't** use gradient text, glass, or blur as decoration; the only blur is the board bar's backdrop and text glows.
- **Don't** put an eyebrow/kicker above a heading — the board label above a title is part of the board, never a section label.
- **Don't** use a system display face (Impact, Arial Black, platform sans) — DotGothic16 is the board voice.
- **Don't** use glyph icons or emoji — all icons are authored SVG in one 1.3–1.5px stroke weight.
