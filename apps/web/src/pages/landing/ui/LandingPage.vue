<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import * as api from '@/shared/api';
import ThemeToggle from '@/shared/ui/ThemeToggle.vue';

interface BoardRow {
  film: string;
  time: string;
  screen: string;
  seatsLeft: number;
  price: number;
  showtimeId: string | null;
}

type SeatState = 'available' | 'held' | 'booked' | 'selected';
type SeatClass = 'REGULAR' | 'VIP' | 'COUPLE';

interface DemoSide {
  row: string;
  number: number;
  key: string;
  state: SeatState;
  category: SeatClass;
  accessible: boolean;
}

const DEMO_PRICE = 50000;
const GRID_ROWS = 8;
const GRID_COLS = 12;

const FALLBACK_ROWS: BoardRow[] = [
  {
    film: 'The Grand Adventure',
    time: '6:00 PM',
    screen: 'AUD 01',
    seatsLeft: 94,
    price: 50000,
    showtimeId: null,
  },
  {
    film: 'The Grand Adventure',
    time: '9:00 PM',
    screen: 'AUD 01',
    seatsLeft: 61,
    price: 50000,
    showtimeId: null,
  },
  {
    film: 'Cinta Pertama',
    time: '7:30 PM',
    screen: 'AUD 02',
    seatsLeft: 88,
    price: 45000,
    showtimeId: null,
  },
  {
    film: 'Komedi Nasional',
    time: '8:15 PM',
    screen: 'AUD 03',
    seatsLeft: 96,
    price: 50000,
    showtimeId: null,
  },
];
const FALLBACK_FEATURED = 'The Grand Adventure';

const tickerText =
  'NOW SHOWING · THE GRAND ADVENTURE — SEAT HOLDS 5:00 · NO DOUBLE-BOOKING — TICKETS IN SECONDS · TKT-042169';

/** Formats an ISO timestamp like `2026-08-20T18:00:00.000Z` → `6:00 PM`. */
function timeLabel(iso: string): string {
  const hh = Number(iso.slice(11, 13));
  const mm = iso.slice(14, 16);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${ampm}`;
}

function posterUrl(title: string, w = 480, h = 720): string {
  const clean = title.replace(/[^A-Za-z0-9 ]/g, '').trim();
  const text = encodeURIComponent((clean || 'CinX').replace(/\s+/g, '+'));
  return `https://placehold.co/${w}x${h}/0d0d10/ffb52e?text=${text}&font=oswald`;
}

/** Mirrors the backend seat-class rules (cinema-service generateSeatGrid). */
function categoryFor(r: number, c: number): SeatClass {
  const isLastRow = r === GRID_ROWS - 1;
  const isLastTwoSeat = c >= GRID_COLS - 2;
  if (isLastRow || isLastTwoSeat) return 'COUPLE';
  const backQuarter = Math.floor(GRID_ROWS * 0.75);
  if (r >= backQuarter) return 'VIP';
  return 'REGULAR';
}

/** Deterministic demo occupancy so the map reads as a live auditorium. */
function stateFor(r: number, c: number): SeatState {
  if (r === 1 && c === 5) return 'booked';
  if (r === 2 && (c === 3 || c === 4)) return 'held';
  if (r === 4 && c === 8) return 'booked';
  return 'available';
}

// ---------- live board ----------

const boardState = ref<'loading' | 'live' | 'demo'>('loading');
const rows = ref<BoardRow[]>([]);
const featuredTitle = ref('');

async function loadBoard(): Promise<void> {
  boardState.value = 'loading';
  try {
    const [showtimes, movies] = await Promise.all([
      api.listShowtimes({ limit: 6 }).catch(() => null),
      api.listMovies({ nowPlaying: true, limit: 1 }).catch(() => null),
    ]);
    if (!showtimes || !showtimes.items.length) throw new Error('empty board');
    const boardRows: BoardRow[] = showtimes.items.map((s) => ({
      film: s.movie.title,
      time: timeLabel(s.startsAt),
      screen: s.theater.name,
      seatsLeft: s.availableSeats,
      price: s.price.amount,
      showtimeId: s.id,
    }));
    rows.value = boardRows;
    featuredTitle.value = movies?.items[0]?.title ?? showtimes.items[0].movie.title;
    boardState.value = 'live';
  } catch {
    rows.value = FALLBACK_ROWS;
    featuredTitle.value = FALLBACK_FEATURED;
    boardState.value = 'demo';
  }
}

onMounted(loadBoard);

// ---------- demo seat map ----------

const selected = ref<Set<string>>(new Set());
const selectedCount = computed(() => selected.value.size);
const total = computed(() => selected.value.size * DEMO_PRICE);

const seatRows = computed<DemoSide[][]>(() => {
  const out: DemoSide[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowLetter = String.fromCharCode(65 + r);
    const row: DemoSide[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const number = c + 1;
      row.push({
        row: rowLetter,
        number,
        key: `${rowLetter}${number}`,
        state: stateFor(r, c),
        category: categoryFor(r, c),
        accessible: rowLetter === 'D' && number === 11,
      });
    }
    out.push(row);
  }
  return out;
});

function isSelected(key: string): boolean {
  return selected.value.has(key);
}

function isLocked(seat: DemoSide): boolean {
  return seat.state === 'held' || seat.state === 'booked';
}

function toggleSeat(seat: DemoSide): void {
  if (isLocked(seat)) return;
  const next = new Set(selected.value);
  if (!next.delete(seat.key)) {
    if (next.size >= 4) return;
    next.add(seat.key);
  }
  selected.value = next;
}

// ---------- FAQ ----------

const openFaq = ref<number | null>(0);

function toggleFaq(i: number): void {
  openFaq.value = openFaq.value === i ? null : i;
}

// ---------- countdown ----------

const seconds = ref(299);
const countdown = computed(() => {
  const s = seconds.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => (seconds.value = seconds.value > 0 ? seconds.value - 1 : 0), 1000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

// ---------- static content ----------

const features = [
  '5-minute seat holds',
  'No double-booking, ever',
  'TKT-XXXXXX tickets in seconds',
];

const steps = [
  {
    num: '01',
    title: 'Discover',
    art: 'poster',
    body: 'Browse now-showing and coming-soon films across every auditorium, ratings and runtimes included.',
  },
  {
    num: '02',
    title: 'Pick your seats',
    art: 'map',
    body: 'Choose a showtime and tap seats on the live map. Held and booked seats are marked the second they change.',
  },
  {
    num: '03',
    title: 'Hold, worry-free',
    art: 'hold',
    body: 'CinX locks your seats for five minutes. Nobody else can take them while you finish.',
  },
  {
    num: '04',
    title: 'Pay & go',
    art: 'ticket',
    body: 'Pay in seconds and get your TKT-XXXXXX ticket codes, ready at the door.',
  },
];

const miniMapRows = computed(() => {
  const out: string[][] = [];
  for (let r = 0; r < 4; r++) {
    const row: string[] = [];
    for (let c = 0; c < 8; c++) {
      row.push(r === 1 && c === 3 ? 'on' : 'off');
    }
    out.push(row);
  }
  return out;
});

const tiers = [
  {
    name: 'REGULAR',
    rows: 'Rows A–F',
    note: 'The great-value seats, front and centre.',
    price: 'Rp 50.000 / seat',
  },
  {
    name: 'VIP',
    rows: 'Row G',
    note: 'Extra legroom and the best sightlines in the house.',
    price: 'Rp 50.000 / seat',
  },
  {
    name: 'COUPLE',
    rows: 'Row H & edge pairs',
    note: 'Side-by-side pairs — no strangers beside you.',
    price: 'Rp 50.000 / seat',
  },
];

const faqs = [
  {
    q: 'How do seat holds actually work?',
    a: 'When you pick seats, CinX locks them for five minutes. Other visitors see them as HELD — they cannot take them. Pay within the window and they are yours.',
  },
  {
    q: 'What happens if my hold expires?',
    a: 'The seats release back to the board and become available again. Just start over — you are never charged until you pay.',
  },
  {
    q: 'Can two people ever book the same seat?',
    a: 'No. A seat has exactly one hold at a time, so a second attempt is rejected with a conflict. A sold seat is never sold twice.',
  },
  {
    q: 'What payment methods are available?',
    a: 'This build uses a mock provider. “Pay now” succeeds instantly, and a “Simulate failure” path shows what happens on a declined payment and how to retry.',
  },
  {
    q: 'Can I cancel a booking?',
    a: 'Pending bookings can be cancelled from My Bookings, which releases the seats. Confirmed bookings show your TKT-XXXXXX ticket codes.',
  },
  {
    q: 'Does CinX work on mobile?',
    a: 'Yes. The SPA is fully responsive, and the seat map is built for touch from the ground up.',
  },
];

function scrollTo(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function poster(title: string, w?: number, h?: number): string {
  return posterUrl(title, w, h);
}

function formatPrice(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}
</script>

<template>
  <div class="landing">
    <header class="board-bar">
      <div class="bar-inner">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">CINX</span>
          <span class="chip-live" :class="{ 'chip-live--off': boardState === 'demo' }">
            {{ boardState === 'loading' ? 'SYNCING' : boardState === 'demo' ? 'DEMO' : 'LIVE' }}
          </span>
        </a>
        <nav class="bar-nav" aria-label="Primary">
          <button type="button" @click="scrollTo('how')">How it works</button>
          <button type="button" @click="scrollTo('theaters')">Theaters &amp; seats</button>
          <button type="button" @click="scrollTo('faq')">FAQ</button>
        </nav>
        <div class="bar-actions">
          <ThemeToggle />
          <router-link class="link-ghost" to="/login">Sign in</router-link>
          <router-link class="btn btn-primary" to="/movies">Book now</router-link>
        </div>
      </div>
    </header>

    <main>
      <!-- HERO — the board IS the product -->
      <section class="hero" id="top">
        <div class="hero-copy">
          <h1 class="display">
            <span class="display-line">Your seat</span>
            <span class="display-line display-line--amber">is waiting.</span>
          </h1>
          <p class="lede">
            Book a cinema seat in under a minute. CinX locks your seats for five minutes while you
            pay — so a seat is never sold twice.
          </p>
          <div class="cta-row">
            <router-link class="btn btn-primary btn-lg" to="/movies">Book now</router-link>
            <button class="btn btn-ghost btn-lg" type="button" @click="scrollTo('how')">
              How it works
            </button>
          </div>
          <ul class="proof">
            <li v-for="f in features" :key="f" class="proof-item">{{ f }}</li>
          </ul>
        </div>

        <div class="hero-board">
          <div class="board" role="region" aria-label="Tonight's showtimes">
            <div class="board-head">
              <span class="board-title">Tonight at CinX</span>
              <span class="board-status" :class="{ 'board-status--demo': boardState === 'demo' }">
                <template v-if="boardState === 'loading'">
                  <span class="dot-pulse" aria-hidden="true"></span>
                  SYNCING
                </template>
                <template v-else-if="boardState === 'demo'">DEMO BOARD</template>
                <template v-else>
                  <span class="dot-pulse" aria-hidden="true"></span>
                  LIVE
                </template>
              </span>
            </div>

            <div class="ticker" aria-hidden="true">
              <div class="ticker-track">
                <span v-for="i in 3" :key="i" class="ticker-item">{{ tickerText }}</span>
              </div>
            </div>

            <div class="hold-strip" role="status" aria-live="polite">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
                <rect x="4" y="7" width="8" height="6" rx="1" stroke="#ffb52e" stroke-width="1.3" />
                <path d="M6 7V5a2 2 0 0 1 4 0v2" stroke="#ffb52e" stroke-width="1.3" />
              </svg>
              <span class="hold-label">Seat G7 held for you</span>
              <span class="hold-time">{{ countdown }}</span>
            </div>

            <div class="board-cols board-cols__h" aria-hidden="true">
              <span class="col-film">Film</span>
              <span class="col-time">Time</span>
              <span class="col-screen">Auditorium</span>
              <span class="col-left">Seats</span>
              <span class="col-price">Price</span>
            </div>

            <div class="board-rows">
              <div
                v-for="(row, i) in rows"
                :key="i"
                class="board-row"
                :class="{ 'board-row--featured': i === 0 }"
                :style="{ '--row-delay': i * 90 + 'ms' }"
              >
                <span class="col-film dot film-cell">
                  <img
                    v-if="i === 0"
                    class="film-thumb"
                    :src="poster(row.film, 96, 144)"
                    alt=""
                    width="40"
                    height="60"
                    loading="lazy"
                  />
                  <span class="film-title">
                    <span v-if="i === 0" class="now-chip">NOW</span>
                    {{ row.film }}
                  </span>
                </span>
                <span class="col-time dot">{{ row.time }}</span>
                <span class="col-screen">{{ row.screen }}</span>
                <span class="col-left dot">{{ row.seatsLeft }}</span>
                <span class="col-price dot">{{ formatPrice(row.price) }}</span>
                <router-link
                  class="btn btn-primary btn-xs"
                  :to="row.showtimeId ? `/showtimes/${row.showtimeId}/seats` : '/movies'"
                  >Book</router-link
                >
              </div>
            </div>

            <div class="board-foot">
              <span>5:00 hold · conflict-safe · TKT-XXXXXX</span>
              <router-link to="/movies">Full schedule &rarr;</router-link>
            </div>
          </div>
        </div>
      </section>

      <!-- HOW IT WORKS -->
      <section class="section" id="how">
        <div class="section-head">
          <h2 class="section-title">Book in four steps</h2>
          <p class="section-sub">
            From first glance to ticket in hand — comfortably under two minutes.
          </p>
        </div>
        <div class="steps">
          <article v-for="step in steps" :key="step.num" class="step">
            <div class="step-art" aria-hidden="true">
              <img
                v-if="step.art === 'poster'"
                class="step-poster"
                :src="poster('The Grand Adventure', 160, 240)"
                alt=""
                width="92"
                height="138"
                loading="lazy"
              />
              <div v-else-if="step.art === 'map'" class="mini-map">
                <div v-for="(row, i) in miniMapRows" :key="i" class="mini-map-row">
                  <span
                    v-for="(cell, j) in row"
                    :key="j"
                    class="mini-seat"
                    :class="{ 'mini-seat--on': cell === 'on' }"
                  ></span>
                </div>
              </div>
              <div v-else-if="step.art === 'hold'" class="mini-hold">
                <span class="mini-hold__digits">05:00</span>
                <span class="mini-hold__label">hold active</span>
              </div>
              <div v-else-if="step.art === 'ticket'" class="mini-ticket">
                <span class="mini-ticket__code">TKT-042169</span>
                <span class="mini-ticket__meta">ROW G · SEAT 7</span>
              </div>
            </div>
            <div class="step-body">
              <span class="step-num">Step {{ step.num }}</span>
              <h3 class="step-title">{{ step.title }}</h3>
              <p class="step-copy">{{ step.body }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- THEATERS & SEATS -->
      <section class="section section--seats" id="theaters">
        <div class="section-head">
          <h2 class="section-title">One auditorium. Three seat classes.</h2>
          <p class="section-sub">
            96 seats, live availability, zero double-booking. Tap any open seat to hold it.
          </p>
        </div>

        <div class="seats-layout">
          <div class="seatmap">
            <div class="screen-arc" aria-hidden="true">Screen</div>
            <div
              class="seat-grid"
              role="group"
              aria-label="Seat map — tap an open seat to select it"
            >
              <div v-for="row in seatRows" :key="row[0].row" class="seat-row">
                <span class="seat-row-label" aria-hidden="true">{{ row[0].row }}</span>
                <button
                  v-for="seat in row"
                  :key="seat.key"
                  type="button"
                  class="seat"
                  :class="{
                    'seat--selected': isSelected(seat.key),
                    'seat--held': seat.state === 'held',
                    'seat--booked': seat.state === 'booked',
                    'seat--vip': seat.category === 'VIP',
                    'seat--couple': seat.category === 'COUPLE',
                    'seat--accessible': seat.accessible,
                  }"
                  :disabled="isLocked(seat)"
                  :aria-label="`Row ${seat.row}, seat ${seat.number}, ${seat.category.toLowerCase()}${seat.accessible ? ', accessible' : ''}${
                    isSelected(seat.key)
                      ? ', selected'
                      : isLocked(seat)
                        ? ', ' + seat.state
                        : ', available'
                  }`"
                  :aria-pressed="isSelected(seat.key)"
                  @click="toggleSeat(seat)"
                ></button>
              </div>
            </div>
            <div class="legend">
              <span class="legend-item"
                ><span class="swatch swatch--available"></span>Available</span
              >
              <span class="legend-item"><span class="swatch swatch--selected"></span>Selected</span>
              <span class="legend-item"><span class="swatch swatch--held"></span>Held</span>
              <span class="legend-item"><span class="swatch swatch--booked"></span>Booked</span>
              <span class="legend-item"><span class="swatch swatch--vip"></span>VIP</span>
            </div>
          </div>

          <aside class="tiers">
            <div class="tiers-head">
              <h3 class="tiers-title">Seat classes</h3>
              <p class="tiers-total" role="status" aria-live="polite">
                {{ selectedCount }} selected · {{ formatPrice(total) }}
              </p>
            </div>
            <div class="tier-list">
              <div v-for="t in tiers" :key="t.name" class="tier">
                <div class="tier-top">
                  <span class="tier-name dot">{{ t.name }}</span>
                  <span class="tier-price">{{ t.price }}</span>
                </div>
                <p class="tier-rows">{{ t.rows }}</p>
                <p class="tier-note">{{ t.note }}</p>
              </div>
            </div>
            <p class="tiers-foot">
              Demo auditorium — one rate across classes; operators price each showtime.
            </p>
            <router-link class="btn btn-primary" to="/movies">Book your seats</router-link>
          </aside>
        </div>
      </section>

      <!-- FAQ -->
      <section class="section" id="faq">
        <div class="section-head">
          <h2 class="section-title">Questions, answered</h2>
          <p class="section-sub">If it's not here, My Bookings keeps the full record.</p>
        </div>
        <div class="faq">
          <div
            v-for="(item, i) in faqs"
            :key="i"
            class="faq-item"
            :class="{ 'faq-item--open': openFaq === i }"
          >
            <button
              type="button"
              class="faq-q"
              :id="'faq-q-' + i"
              :aria-expanded="openFaq === i"
              :aria-controls="'faq-panel-' + i"
              @click="toggleFaq(i)"
            >
              <span class="faq-q-text">{{ item.q }}</span>
              <svg class="faq-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            <div
              class="faq-panel"
              :id="'faq-panel-' + i"
              role="region"
              :aria-labelledby="'faq-q-' + i"
            >
              <div class="faq-a">{{ item.a }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- FINAL CTA -->
      <section class="final">
        <div class="final-board">
          <span class="board-title">Now showing</span>
          <h2 class="final-title">The screen's about to start.</h2>
          <p class="final-copy">Pick a film, hold your seats, and be in the dark in two minutes.</p>
          <router-link class="btn btn-primary btn-lg" to="/movies">Book now</router-link>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-grid">
        <div class="footer-brand">
          <router-link class="brand" to="/">
            <span class="brand-mark" aria-hidden="true"></span>
            <span class="brand-name">CINX</span>
          </router-link>
          <p class="footer-tagline">
            Cinema tickets, held for you. Five-minute seat holds backed by a real distributed lock —
            no double-booking, ever.
          </p>
        </div>
        <nav class="footer-col" aria-label="Explore">
          <h3 class="footer-col-title">Explore</h3>
          <router-link to="/movies">Browse films</router-link>
          <router-link to="/bookings">My bookings</router-link>
          <router-link to="/login">Sign in</router-link>
        </nav>
        <nav class="footer-col" aria-label="Support">
          <h3 class="footer-col-title">Support</h3>
          <button type="button" @click="scrollTo('how')">How it works</button>
          <button type="button" @click="scrollTo('theaters')">Theaters &amp; seats</button>
          <button type="button" @click="scrollTo('faq')">FAQ</button>
        </nav>
        <div class="footer-col">
          <h3 class="footer-col-title">System</h3>
          <p>5-minute seat holds</p>
          <p>Conflict-safe booking</p>
          <p>TKT-XXXXXX ticket codes</p>
        </div>
      </div>
      <div class="footer-base">
        <span>&copy; 2026 CinX</span>
        <span class="footer-base-dot" aria-hidden="true"></span>
        <span>Demo build · mock payment</span>
        <span class="footer-base-dot" aria-hidden="true"></span>
        <span>Seats locked with Redis redlock</span>
      </div>
    </footer>
  </div>
</template>
