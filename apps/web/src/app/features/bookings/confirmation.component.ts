import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Booking, BookingSeatSnapshot } from '../../core/models';

@Component({
  selector: 'app-confirmation',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  template: `
    @if (booking.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading booking…
      </div>
    } @else if (booking.hasValue()) {
      @let b = booking.value()!;
      @if (b.status !== 'CONFIRMED') {
        <div class="bx-empty">
          <p class="bx-empty-title">Booking {{ b.status }}</p>
          <p class="bx-empty-copy">
            This booking is {{ b.status }}. You can view past bookings in My Bookings.
          </p>
          <a routerLink="/bookings" class="bx-btn bx-btn--ghost bx-btn--sm">My Bookings</a>
        </div>
      } @else {
        <div class="bx-steps" aria-hidden="true">
          <span class="bx-step bx-step--done"><span class="bx-step-num">01</span> Select</span>
          <span class="bx-step bx-step--done"><span class="bx-step-num">02</span> Pay</span>
          <span class="bx-step bx-step--current"><span class="bx-step-num">03</span> Tickets</span>
        </div>

        <div class="bx-panel">
          <div class="bx-panel-head">
            <h1 class="bx-panel-title">Tickets issued</h1>
            <span class="bx-chip bx-chip--green">
              <span class="bx-chip-dot" aria-hidden="true"></span>
              Confirmed
            </span>
          </div>
          <div class="bx-panel-body">
            <p role="status" class="bx-ok mb-2">Payment received — your booking is confirmed.</p>

            <div class="mt-4">
              <div class="bx-summary-item">
                <span class="bx-summary-label">Movie</span>
                <span class="bx-summary-value">{{ b.movie?.title }}</span>
              </div>
              <div class="bx-summary-item">
                <span class="bx-summary-label">Theater</span>
                <span class="bx-summary-value">{{ b.theater?.name }}</span>
              </div>
              <div class="bx-summary-item">
                <span class="bx-summary-label">Starts at</span>
                <span class="bx-summary-value bx-data">
                  {{ b.startsAt | date: 'EEE, MMM d · h:mm a' }}
                </span>
              </div>
              <div class="bx-summary-item">
                <span class="bx-summary-label">Total paid</span>
                <span class="bx-summary-value bx-data">
                  {{ b.totalAmount | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }}
                </span>
              </div>
            </div>

            <h2 class="bx-h2 mb-3 mt-6">Your tickets</h2>
            @if (b.tickets?.length) {
              <div class="space-y-4">
                @for (t of b.tickets; track t.code) {
                  <div class="bx-stub">
                    <p class="bx-stub-code">{{ t.code }}</p>
                    <div class="bx-stub-meta">
                      <span>{{ b.movie?.title }}</span>
                      <span>{{ b.theater?.name }}</span>
                      <span>{{ b.startsAt | date: 'EEE, MMM d · h:mm a' }}</span>
                      <span>Seat {{ t.seatId }} {{ seatLabel(b.seats, t.seatId) }}</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="bx-dim">No tickets found for this booking.</p>
            }

            <p class="bx-label mt-6">Booking: {{ b.id }}</p>
            <a routerLink="/movies" class="bx-btn bx-btn--ghost mt-6">Back to cinema</a>
          </div>
        </div>
      }
    }
  `,
})
export class ConfirmationComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly params = toSignal(this.route.paramMap, { initialValue: null });
  protected readonly id = computed(() => this.params()?.get('id') ?? '');

  protected readonly booking = resource({
    params: () => (this.id() ? this.id() : undefined),
    loader: ({ params }) => firstValueFrom(this.api.getBooking(params)),
  });

  protected seatLabel(seats: BookingSeatSnapshot[], seatId: string): string {
    const seat = seats.find((s) => s.seatId === seatId);
    return seat ? `(row ${seat.rowLabel} #${seat.seatNumber})` : '';
  }
}
