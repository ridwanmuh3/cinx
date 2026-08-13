import { Component, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Booking, MockSimulation } from '../../core/models';
import type { OnDestroy } from '@angular/core';

@Component({
  selector: 'app-checkout',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  template: `
    @if (booking.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading booking…
      </div>
    } @else if (booking.hasValue()) {
      @let b = booking.value()!;
      <div class="bx-steps" aria-hidden="true">
        <span class="bx-step bx-step--done"><span class="bx-step-num">01</span> Select</span>
        <span class="bx-step bx-step--current"><span class="bx-step-num">02</span> Pay</span>
        <span class="bx-step"><span class="bx-step-num">03</span> Tickets</span>
      </div>

      <div class="bx-panel">
        <div class="bx-panel-head">
          <h1 class="bx-panel-title">{{ b.movie?.title }}</h1>
          <span class="bx-chip bx-chip--amber">
            <span class="bx-chip-dot bx-chip-dot--pulse" aria-hidden="true"></span>
            Hold live
          </span>
        </div>
        <div class="bx-panel-body">
          <p class="bx-dim mb-4">
            {{ b.theater?.name }} · {{ b.startsAt | date: 'EEE, MMM d · h:mm a' }}
          </p>

          <div class="bx-hold">
            <span class="bx-hold-label">Hold expires in</span>
            <span
              role="timer"
              class="bx-count"
              [class.bx-count--expired]="expired()"
              [class.bx-count--warn]="warning()"
              >{{ countdownText() }}</span
            >
          </div>

          @for (seat of b.seats; track seat.seatId) {
            <div class="bx-summary-item">
              <span class="bx-summary-label">Seat {{ seat.rowLabel }}{{ seat.seatNumber }}</span>
              <span class="bx-summary-value bx-data">{{ seat.category }}</span>
            </div>
          }
          <div class="bx-summary-item">
            <span class="bx-summary-label">Total</span>
            <span class="bx-summary-value bx-data text-[19px] text-amber">
              {{ b.totalAmount | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }}
            </span>
          </div>

          @if (expired()) {
            <p role="alert" class="bx-err mt-5">
              Your hold expired and the seats were released. Pick your seats again.
            </p>
            <a routerLink="/movies" class="bx-btn bx-btn--ghost mt-4">Back to cinema</a>
          } @else if (paidStatus() === 'success') {
            <p role="status" class="bx-ok mt-5">Payment successful — booking confirmed.</p>
            <button
              type="button"
              class="bx-btn bx-btn--primary mt-4"
              (click)="goConfirm(b.id)"
            >
              View tickets
            </button>
          } @else if (paidStatus() === 'failed') {
            <p role="alert" class="bx-err mt-5">
              Payment failed. Your hold is still active until it expires — retry, or pick different
              seats.
            </p>
            <button type="button" class="bx-btn bx-btn--ghost mt-4" (click)="retry()">
              Retry payment
            </button>
          } @else {
            <div class="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                class="bx-btn bx-btn--primary"
                (click)="pay(undefined)"
                [disabled]="paying()"
              >
                {{ paying() ? 'Processing…' : 'Pay now (success)' }}
              </button>
              <button
                type="button"
                class="bx-btn bx-btn--danger"
                (click)="pay('FAILURE')"
                [disabled]="paying()"
              >
                Simulate failure
              </button>
            </div>
          }

          @if (error()) {
            <p role="alert" class="bx-err mt-4">{{ error() }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class CheckoutComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly params = toSignal(this.route.queryParamMap, { initialValue: null });
  protected readonly bookingId = computed(() => this.params()?.get('bookingId') ?? '');

  protected readonly booking = resource({
    params: () => (this.bookingId() ? this.bookingId() : undefined),
    loader: ({ params }) => firstValueFrom(this.api.getBooking(params)),
  });

  protected readonly paying = signal(false);
  protected readonly paidStatus = signal<'idle' | 'success' | 'failed'>('idle');
  protected readonly error = signal<string | null>(null);

  /* ---- hold countdown: ticks against the booking's expiresAt ---- */
  private readonly remainingMs = signal<number | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => {
      const b = this.booking.value();
      if (b?.expiresAt) {
        this.remainingMs.set(Math.max(0, new Date(b.expiresAt).getTime() - Date.now()));
      }
    }, 1000);
  }

  protected readonly countdownText = computed(() => {
    const ms = this.remainingMs();
    if (ms === null) return '--:--';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  protected readonly expired = computed(() => {
    const ms = this.remainingMs();
    return ms !== null && ms <= 0;
  });
  protected readonly warning = computed(() => {
    const ms = this.remainingMs();
    return ms !== null && ms > 0 && ms < 60000;
  });

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  pay(simulate?: MockSimulation): void {
    const id = this.bookingId();
    if (!id) return;
    this.paying.set(true);
    this.error.set(null);
    this.api.pay(id, simulate).subscribe({
      next: (b) => {
        this.paying.set(false);
        this.paidStatus.set(b.status === 'CONFIRMED' ? 'success' : 'failed');
      },
      error: (err) => {
        this.paying.set(false);
        this.error.set(err?.error?.message || err?.message || 'Payment failed');
      },
    });
  }

  retry(): void {
    this.paidStatus.set('idle');
    this.error.set(null);
  }

  goConfirm(bookingId: string): void {
    this.router.navigate(['/bookings/confirm', bookingId]);
  }
}
