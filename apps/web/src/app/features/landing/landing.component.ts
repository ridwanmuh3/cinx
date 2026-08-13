import { Component, computed, inject, OnDestroy, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

export interface BoardRow {
  film: string;
  time: string;
  screen: string;
  seatsLeft: number;
  price: number;
  showtimeId: string | null;
}

export interface BoardData {
  rows: BoardRow[];
  featuredTitle: string;
  demo: boolean;
}

export type SeatState = 'available' | 'held' | 'booked' | 'selected';
export type SeatClass = 'REGULAR' | 'VIP' | 'COUPLE';

export interface DemoSide {
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

@Component({
  selector: 'app-landing',
  imports: [RouterLink, ThemeToggleComponent],
  host: { class: 'landing' },
  templateUrl: './landing.html',
})
export class LandingComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  protected readonly demoPrice = DEMO_PRICE;
  protected readonly tickerText =
    'NOW SHOWING · THE GRAND ADVENTURE — SEAT HOLDS 5:00 · NO DOUBLE-BOOKING — TICKETS IN SECONDS · TKT-042169';

  protected readonly board = resource<BoardData, unknown>({
    loader: async (): Promise<BoardData> => {
      try {
        const [showtimes, movies] = await Promise.all([
          firstValueFrom(this.api.listShowtimes({ limit: 6 }).pipe(timeout(4000))),
          firstValueFrom(this.api.listMovies({ nowPlaying: true, limit: 1 }).pipe(timeout(4000))),
        ]);
        const rows: BoardRow[] = showtimes.items.map((s) => ({
          film: s.movie.title,
          time: timeLabel(s.startsAt),
          screen: s.theater.name,
          seatsLeft: s.availableSeats,
          price: s.price.amount,
          showtimeId: s.id,
        }));
        if (!rows.length) throw new Error('empty board');
        const featured = movies.items[0] ?? showtimes.items[0].movie;
        return { rows, featuredTitle: featured.title, demo: false };
      } catch {
        return { rows: FALLBACK_ROWS, featuredTitle: FALLBACK_FEATURED, demo: true };
      }
    },
  });

  protected readonly rows = computed(() => this.board.value()?.rows ?? []);
  protected readonly featuredTitle = computed(() => this.board.value()?.featuredTitle ?? '');
  protected readonly boardDemo = computed(() => this.board.value()?.demo ?? false);

  protected readonly features = [
    '5-minute seat holds',
    'No double-booking, ever',
    'TKT-XXXXXX tickets in seconds',
  ];

  protected readonly steps = [
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

  protected readonly miniMapRows = computed(() => {
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

  protected readonly tiers = [
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

  protected readonly faqs = [
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

  protected readonly seatRows = computed<DemoSide[][]>(() => {
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

  private readonly selected = signal<Set<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly total = computed(() => this.selected().size * DEMO_PRICE);

  protected readonly openFaq = signal<number | null>(0);

  private readonly seconds = signal(299);
  protected readonly countdown = computed(() => {
    const s = this.seconds();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  ngOnInit(): void {
    this.timer = setInterval(() => this.seconds.update((v) => (v > 0 ? v - 1 : 0)), 1000);
  }

  protected isSelected(key: string): boolean {
    return this.selected().has(key);
  }

  protected isLocked(seat: DemoSide): boolean {
    return seat.state === 'held' || seat.state === 'booked';
  }

  protected toggleSeat(seat: DemoSide): void {
    if (this.isLocked(seat)) return;
    const next = new Set(this.selected());
    if (!next.delete(seat.key)) {
      if (next.size >= 4) return;
      next.add(seat.key);
    }
    this.selected.set(next);
  }

  protected toggleFaq(i: number): void {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }

  protected scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected poster(title: string, w?: number, h?: number): string {
    return posterUrl(title, w, h);
  }

  protected formatPrice(amount: number): string {
    return 'Rp ' + amount.toLocaleString('id-ID');
  }
}
