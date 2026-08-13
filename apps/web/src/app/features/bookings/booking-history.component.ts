import { Component, inject, resource, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Booking } from '../../core/models';

@Component({
  selector: 'app-booking-history',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  template: `
    <div class="bx-page-head">
      <h1 class="bx-h1">My bookings</h1>
      <button class="bx-btn bx-btn--sm bx-btn--ghost" type="button" (click)="reload()">
        Refresh
      </button>
    </div>

    @if (bookings.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading…
      </div>
    } @else if (bookings.hasValue()) {
      @let page = bookings.value()!;
      @if (page.items.length === 0) {
        <div class="bx-empty">
          <p class="bx-empty-title">No bookings yet</p>
          <p class="bx-empty-copy">
            Browse now-showing movies and pick your seats — they'll be held for you while you pay.
          </p>
          <a routerLink="/movies" class="bx-btn bx-btn--primary bx-btn--sm">Browse movies</a>
        </div>
      } @else {
        <div class="bx-panel">
          @for (b of page.items; track b.id) {
            <div class="bx-row">
              <div>
                <p class="bx-row-title">{{ b.movie?.title }}</p>
                <p class="bx-row-meta">
                  {{ b.startsAt | date: 'EEE, MMM d · h:mm a' }} · {{ b.theater?.name }} ·
                  {{ b.seats.length }} seat(s) ·
                  {{ b.totalAmount | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }}
                </p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <span class="bx-chip {{ statusChip(b.status) }}">{{ statusLabel(b.status) }}</span>
                <div class="bx-row-actions">
                  @if (b.status === 'PENDING') {
                    <a
                      [routerLink]="['/bookings/checkout']"
                      [queryParams]="{ bookingId: b.id }"
                      class="bx-btn bx-btn--primary bx-btn--sm"
                      >Pay</a
                    >
                    <button
                      type="button"
                      class="bx-btn bx-btn--ghost bx-btn--sm"
                      (click)="cancel(b)"
                    >
                      Cancel
                    </button>
                  } @else if (b.status === 'CONFIRMED') {
                    <a
                      [routerLink]="['/bookings/confirm', b.id]"
                      class="bx-btn bx-btn--ghost bx-btn--sm"
                      >View tickets</a
                    >
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    } @else if (bookings.error()) {
      <p role="alert" class="bx-err">{{ bookings.error()?.message || 'Could not load your bookings.' }}</p>
    }

    @if (error()) {
      <p role="alert" class="bx-err mt-4">{{ error() }}</p>
    }
  `,
})
export class BookingHistoryComponent {
  private readonly api = inject(ApiService);

  protected readonly refreshKey = signal(0);
  protected readonly error = signal<string | null>(null);

  protected readonly bookings = resource({
    params: () => this.refreshKey(),
    loader: () => firstValueFrom(this.api.listBookings({ limit: 20 })),
  });

  reload(): void {
    this.refreshKey.update((n) => n + 1);
  }

  cancel(booking: Booking): void {
    this.api.cancelBooking(booking.id).subscribe({
      next: () => this.reload(),
      error: (err) => {
        this.error.set(err?.error?.message || err?.error?.error || 'Cancel failed');
      },
    });
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Pending payment',
      CONFIRMED: 'Confirmed',
      EXPIRED: 'Expired',
      CANCELLED: 'Cancelled',
    };
    return labels[status] ?? status;
  }

  protected statusChip(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'bx-chip--amber';
      case 'CONFIRMED':
        return 'bx-chip--green';
      case 'EXPIRED':
        return 'bx-chip--red';
      default:
        return '';
    }
  }
}
