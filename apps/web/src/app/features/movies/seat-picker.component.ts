import { Component, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { SeatAvailability } from '../../core/models';
import type { OnDestroy } from '@angular/core';

interface HeldSeatInfo {
  seatId: string;
  row: string;
  seatNumber: number;
  priceAmount: number;
  priceCurrency: 'IDR';
}

@Component({
  selector: 'app-seat-picker',
  imports: [DatePipe, CurrencyPipe],
  template: `
    @if (seatMap.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading seat map…
      </div>
    } @else if (seatMap.hasValue() && showtime.hasValue()) {
      @let map = seatMap.value()!;
      @let s = showtime.value()!;
      <div class="bx-steps" aria-hidden="true">
        <span class="bx-step bx-step--current"><span class="bx-step-num">01</span> Select</span>
        <span class="bx-step"><span class="bx-step-num">02</span> Pay</span>
        <span class="bx-step"><span class="bx-step-num">03</span> Tickets</span>
      </div>

      <div class="bx-panel">
        <div class="bx-panel-head">
          <h1 class="bx-panel-title">{{ s.movie.title }}</h1>
          <span class="bx-chip bx-chip--amber">
            <span class="bx-chip-dot bx-chip-dot--pulse" aria-hidden="true"></span>
            Live
          </span>
        </div>
        <div class="bx-panel-body">
          <p class="bx-dim mb-4">
            {{ s.theater.name }} · {{ s.startsAt | date: 'EEE, MMM d · h:mm a' }} · Price per seat:
            @if (map.price?.amount != null) {
              {{ map.price.amount | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }}
            } @else {
              —
            }
          </p>

          @if (held()) {
            <div class="bx-hold">
              <span class="bx-hold-label">Seats held for you</span>
              <span
                role="timer"
                class="bx-count"
                [class.bx-count--expired]="expired()"
                [class.bx-count--warn]="warning()"
                >{{ countdownText() }}</span
              >
            </div>
          }

          <div class="bx-seatmap mt-5">
            <div class="bx-screen-arc">Screen</div>
            <div class="bx-seat-grid">
              @for (entry of grouped(); track entry.row) {
                <div class="bx-seat-row">
                  <span class="bx-seat-row-label">{{ entry.row }}</span>
                  @for (seat of entry.seats; track seat.id) {
                    <button
                      type="button"
                      class="bx-seat {{ seatClass(seat) }}"
                      (click)="toggle(seat)"
                      [disabled]="isUnavailable(seat)"
                      [attr.aria-pressed]="isUnavailable(seat) ? null : isPicked(seat.id)"
                      [attr.aria-label]="seatAria(seat)"
                      >{{ seat.number }}</button
                    >
                  }
                </div>
              }
              @if (grouped().length === 0) {
                <p class="bx-dim">No seats available for this showtime.</p>
              }
            </div>
            <div class="bx-legend">
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--available"></span>Available</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--selected"></span>Selected</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--held"></span>Held</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--booked"></span>Booked</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--vip"></span>VIP</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--couple"></span>Couple</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--accessible"></span>Accessible</span>
              <span class="bx-legend-item"><span class="bx-swatch bx-swatch--disabled"></span>Unavailable</span>
            </div>
          </div>

          <div class="bx-hold mt-5">
            <span class="bx-data text-sm text-bone-dim">
              Selected: {{ selectedCount() }} seat(s) · Total:
              {{ total() | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }}
            </span>
            <button
              type="button"
              class="bx-btn bx-btn--primary"
              (click)="hold()"
              [disabled]="selectedCount() === 0 || loading()"
            >
              @if (loading()) {
                Holding…
              } @else {
                Hold seats
              }
            </button>
          </div>

          @if (error()) {
            <p role="alert" class="bx-err mt-4">{{ error() }}</p>
          }
        </div>
      </div>
    } @else if (seatMap.error()) {
      <p role="alert" class="bx-err">
        {{ seatMap.error()?.message || 'Could not load the seat map.' }}
      </p>
    }
  `,
})
export class SeatPickerComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly params = toSignal(this.route.paramMap, { initialValue: null });
  protected readonly id = computed(() => this.params()?.get('id') ?? '');

  protected readonly showtime = resource({
    params: () => (this.id() ? this.id() : undefined),
    loader: ({ params }) => firstValueFrom(this.api.getShowtime(params)),
  });
  protected readonly seatMap = resource({
    params: () => (this.id() ? this.id() : undefined),
    loader: ({ params }) => firstValueFrom(this.api.getSeatMap(params)),
  });

  private readonly selected = signal<Set<string>>(new Set());
  protected readonly held = signal<{
    bookingId: string;
    expiresAt: string;
    seats: HeldSeatInfo[];
  } | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly grouped = computed(() => {
    const map = this.seatMap.hasValue() ? this.seatMap.value()! : null;
    if (!map) return [];
    const rows = new Map<string, SeatAvailability[]>();
    map.seats.forEach((seat) => {
      const arr = rows.get(seat.row) ?? [];
      arr.push(seat);
      rows.set(seat.row, arr);
    });
    const out: { row: string; seats: SeatAvailability[] }[] = [];
    for (const [row, seats] of rows) {
      out.push({ row, seats: seats.sort((a, b) => a.number - b.number) });
    }
    return out.sort((a, b) => a.row.localeCompare(b.row));
  });

  protected readonly selectedCount = computed(() => this.selected().size);

  protected readonly total = computed(() => {
    const map = this.seatMap.hasValue() ? this.seatMap.value()! : null;
    const price = map?.price?.amount;
    if (!map || price == null) return 0;
    let sum = 0;
    map.seats.forEach((s) => {
      if (this.selected().has(s.id)) sum += price;
    });
    return sum;
  });

  /* ---- hold countdown (5-minute TTL from the API) ---- */
  private readonly remainingMs = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly countdownText = computed(() => {
    const ms = this.remainingMs();
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  protected readonly expired = computed(() => this.remainingMs() <= 0);
  protected readonly warning = computed(
    () => this.remainingMs() > 0 && this.remainingMs() < 60000,
  );

  protected isPicked(id: string): boolean {
    return this.selected().has(id);
  }

  /** A seat is only blocked when explicitly occupied/held or disabled; a
   *  missing status means AVAILABLE. */
  protected isUnavailable(seat: SeatAvailability): boolean {
    return seat.isDisabled || seat.status === 'HELD' || seat.status === 'BOOKED';
  }

  protected seatClass(seat: SeatAvailability): string {
    const cls: string[] = [];
    if (seat.isDisabled) {
      cls.push('bx-seat--disabled');
    } else if (seat.status === 'BOOKED') {
      cls.push('bx-seat--booked');
    } else if (seat.status === 'HELD') {
      cls.push('bx-seat--held');
    } else if (this.isPicked(seat.id)) {
      cls.push('bx-seat--selected');
    }
    if (seat.category === 'VIP' && !this.isPicked(seat.id) && seat.status === 'AVAILABLE') {
      cls.push('bx-seat--vip');
    }
    if (seat.category === 'COUPLE' && !this.isPicked(seat.id) && seat.status === 'AVAILABLE') {
      cls.push('bx-seat--couple');
    }
    if (seat.isAccessible && !this.isPicked(seat.id) && seat.status === 'AVAILABLE') {
      cls.push('bx-seat--accessible');
    }
    return cls.join(' ');
  }

  protected seatAria(seat: SeatAvailability): string {
    const category = seat.category.toLowerCase();
    const accessible = seat.isAccessible ? ', accessible' : '';
    const status = seat.isDisabled
      ? 'unavailable'
      : this.isPicked(seat.id)
        ? 'selected'
        : seat.status.toLowerCase();
    return `Row ${seat.row}, seat ${seat.number}, ${category}${accessible}, ${status}`;
  }

  toggle(seat: SeatAvailability): void {
    if (this.isUnavailable(seat)) return;
    const next = new Set(this.selected());
    if (!next.delete(seat.id)) next.add(seat.id);
    this.selected.set(next);
  }

  startCountdown(expiresAt: string): void {
    const target = new Date(expiresAt).getTime();
    const tick = () => this.remainingMs.set(Math.max(0, target - Date.now()));
    tick();
    this.timer = setInterval(tick, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  hold(): void {
    if (this.selected().size === 0) return;
    const ids = [...this.selected()];
    this.loading.set(true);
    this.error.set(null);
    this.api.hold({ showtimeId: this.id(), seatIds: ids }).subscribe({
      next: (res) => {
        this.held.set({
          bookingId: res.bookingId,
          expiresAt: res.expiresAt,
          seats: res.seats.map((s) => ({
            seatId: s.seatId,
            row: s.rowLabel,
            seatNumber: s.seatNumber,
            priceAmount: s.priceAmount,
            priceCurrency: 'IDR',
          })),
        });
        this.loading.set(false);
        this.startCountdown(res.expiresAt);
        this.router.navigate(['/bookings/checkout'], {
          queryParams: { bookingId: res.bookingId },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || err?.message || 'Could not hold seats');
      },
    });
  }
}
