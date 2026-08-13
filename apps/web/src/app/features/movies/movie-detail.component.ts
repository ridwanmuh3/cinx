import { Component, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Movie, Showtime, TheaterSummary } from '../../core/models';

@Component({
  selector: 'app-movie-detail',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  template: `
    @if (movie.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading…
      </div>
    } @else if (movie.hasValue()) {
      @let m = movie.value()!;
      <div class="bx-detail-layout">
        @if (m.posterUrl) {
          <div class="bx-poster-frame">
            <img [src]="m.posterUrl" [alt]="m.title" width="440" height="660" loading="lazy" />
          </div>
        } @else {
          <div class="bx-poster-frame bx-poster-frame--empty">No poster</div>
        }
        <div>
          <h1 class="bx-h1">{{ m.title }}</h1>
          <div class="bx-detail-meta">
            <span class="bx-data text-sm text-bone-dim">
              {{ m.durationMinutes }} min · {{ m.ageRating }}
            </span>
            <span class="bx-data text-sm text-bone-dim">·</span>
            <span class="bx-chip">Releases {{ m.releaseDate | date: 'mediumDate' }}</span>
          </div>
          @if (m.genres.length) {
            <p class="bx-label mb-2">Genres</p>
            <p class="bx-data text-sm text-bone mb-4">{{ m.genres.join(', ') }}</p>
          }
          <p class="bx-detail-copy">{{ m.synopsis }}</p>
          @if (firstShowtimeId()) {
            <a
              [routerLink]="['/showtimes', firstShowtimeId(), 'seats']"
              class="bx-btn bx-btn--primary mt-6"
              >Book tickets</a
            >
          }
        </div>
      </div>

      <section class="bx-section-gap">
        <h2 class="bx-h2 mb-4">Showtimes</h2>
        @if (showtimes.isLoading()) {
          <div class="bx-loading">
            <span class="bx-loading-dot" aria-hidden="true"></span>
            Loading showtimes…
          </div>
        } @else if (showtimes.hasValue()) {
          <div class="bx-field bx-filter">
            <label class="bx-field-label" for="theater-filter">Choose cinema</label>
            <select
              id="theater-filter"
              class="bx-select"
              [value]="selectedTheaterId()"
              (change)="onTheaterChange($event)"
            >
              <option value="">All cinemas</option>
              @for (t of theaters(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
          </div>
          @let list = filteredShowtimes();
          @if (list.length === 0) {
            <p class="bx-dim">No upcoming showtimes.</p>
          } @else {
            <div class="bx-panel">
              @for (s of list; track s.id) {
                <div class="bx-row">
                  <div>
                    <p class="bx-row-title">{{ s.theater.name }}</p>
                    <p class="bx-row-meta">
                      {{ s.startsAt | date: 'EEE, MMM d · h:mm a' }} ·
                      <span class="text-green">{{ s.availableSeats }} seats left</span> ·
                      {{ s.price.amount | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }} / seat
                    </p>
                  </div>
                  <a
                    [routerLink]="['/showtimes', s.id, 'seats']"
                    class="bx-btn bx-btn--ghost bx-btn--sm"
                    >Select seats</a
                  >
                </div>
              }
            </div>
          }
        } @else if (showtimes.error()) {
          <p role="alert" class="bx-err">
            {{ showtimes.error()?.message || 'Could not load showtimes.' }}
          </p>
        }
      </section>
    } @else if (movie.error()) {
      <p role="alert" class="bx-err">{{ movie.error()?.message || 'Could not load this movie.' }}</p>
    }
  `,
})
export class MovieDetailComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly params = toSignal(this.route.paramMap, { initialValue: null });
  protected readonly id = computed(() => this.params()?.get('id') ?? '');

  protected readonly movie = resource({
    params: () => (this.id() ? this.id() : undefined),
    loader: ({ params }) => firstValueFrom(this.api.getMovie(params)),
  });
  protected readonly showtimes = resource({
    params: () => (this.id() ? this.id() : undefined),
    loader: ({ params }) => firstValueFrom(this.api.listShowtimes({ movieId: params, limit: 100 })),
  });

  protected readonly selectedTheaterId = signal('');

  protected readonly theaters = computed(() => {
    const items = this.showtimes.hasValue() ? this.showtimes.value()!.items : [];
    const byId = new Map<string, TheaterSummary>();
    for (const s of items) byId.set(s.theater.id, s.theater);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly filteredShowtimes = computed(() => {
    const items = this.showtimes.hasValue() ? this.showtimes.value()!.items : [];
    const theaterId = this.selectedTheaterId();
    return theaterId ? items.filter((s) => s.theater.id === theaterId) : items;
  });

  protected readonly showtimesList = computed(() =>
    this.showtimes.hasValue() ? this.showtimes.value()!.items : [],
  );
  protected readonly firstShowtimeId = computed(() => this.showtimesList()[0]?.id ?? null);

  protected onTheaterChange(event: Event): void {
    this.selectedTheaterId.set((event.target as HTMLSelectElement).value);
  }
}
