import { Component, inject, resource, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Movie, Theater, Showtime } from '../../core/models';

@Component({
  selector: 'app-showtimes-admin',
  imports: [ReactiveFormsModule, DatePipe, CurrencyPipe],
  template: `
    <div class="bx-panel mb-6">
      <div class="bx-panel-head">
        <h2 class="bx-panel-title">Create showtime</h2>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()" class="bx-form-grid bx-panel-body">
        <div class="bx-field">
          <label class="bx-field-label" for="st-movie">Movie</label>
          <select
            id="st-movie"
            class="bx-select"
            formControlName="movieId"
            required
            [attr.aria-invalid]="form.controls.movieId.touched && form.controls.movieId.invalid"
            [attr.aria-describedby]="
              form.controls.movieId.touched && form.controls.movieId.invalid ? 'st-movie-err' : null
            "
          >
            <option value="">Select a movie</option>
            @if (movies.hasValue()) {
              @let list = movies.value()!;
              @for (m of list.items; track m.id) {
                <option [ngValue]="m.id">{{ m.title }}</option>
              }
            }
          </select>
          @if (form.controls.movieId.touched && form.controls.movieId.invalid) {
            <p id="st-movie-err" class="bx-err">Choose a movie.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="st-theater">Theater</label>
          <select
            id="st-theater"
            class="bx-select"
            formControlName="theaterId"
            required
            [attr.aria-invalid]="
              form.controls.theaterId.touched && form.controls.theaterId.invalid
            "
            [attr.aria-describedby]="
              form.controls.theaterId.touched && form.controls.theaterId.invalid
                ? 'st-theater-err'
                : null
            "
          >
            <option value="">Select a theater</option>
            @if (theaters.hasValue()) {
              @let list = theaters.value()!;
              @for (t of list.items; track t.id) {
                <option [ngValue]="t.id">{{ t.name }}</option>
              }
            }
          </select>
          @if (form.controls.theaterId.touched && form.controls.theaterId.invalid) {
            <p id="st-theater-err" class="bx-err">Choose a theater.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="st-starts">Starts at</label>
          <input
            id="st-starts"
            class="bx-input"
            type="datetime-local"
            formControlName="startsAt"
            required
            [attr.aria-invalid]="form.controls.startsAt.touched && form.controls.startsAt.invalid"
            [attr.aria-describedby]="
              form.controls.startsAt.touched && form.controls.startsAt.invalid
                ? 'st-starts-err'
                : null
            "
          />
          @if (form.controls.startsAt.touched && form.controls.startsAt.invalid) {
            <p id="st-starts-err" class="bx-err">Choose a start time.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="st-price">Price (IDR)</label>
          <input
            id="st-price"
            class="bx-input"
            type="number"
            min="0"
            formControlName="priceAmount"
            required
            [attr.aria-invalid]="form.controls.priceAmount.touched && form.controls.priceAmount.invalid"
            [attr.aria-describedby]="
              form.controls.priceAmount.touched && form.controls.priceAmount.invalid
                ? 'st-price-err'
                : null
            "
          />
          @if (form.controls.priceAmount.touched && form.controls.priceAmount.invalid) {
            <p id="st-price-err" class="bx-err">Enter a price of 0 or more.</p>
          }
        </div>
        <div class="bx-span-2 flex flex-wrap gap-2">
          <button type="submit" class="bx-btn bx-btn--primary" [disabled]="form.invalid || saving()">
            {{ saving() ? 'Saving…' : 'Create' }}
          </button>
        </div>
        @if (error()) {
          <p role="alert" class="bx-err bx-span-2">{{ error() }}</p>
        }
      </form>
    </div>

    @if (showtimes.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading…
      </div>
    } @else if (showtimes.hasValue()) {
      @let page = showtimes.value()!;
      @if (page.items.length === 0) {
        <div class="bx-empty">
          <p class="bx-empty-title">No showtimes yet</p>
          <p class="bx-empty-copy">Create the first showtime above — it will appear here.</p>
        </div>
      } @else {
        <div class="bx-scroll">
          <table class="bx-table">
            <thead>
              <tr>
                <th scope="col">Movie</th>
                <th scope="col">Theater</th>
                <th scope="col">Starts at</th>
                <th scope="col">Price</th>
                <th scope="col" class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (s of page.items; track s.id) {
                <tr>
                  <td class="bx-td-data">{{ s.movie.title }}</td>
                  <td class="bx-td-data text-bone-dim">{{ s.theater.name }}</td>
                  <td class="bx-td-data">{{ s.startsAt | date: 'medium' }}</td>
                  <td class="bx-td-data">
                    {{ s.price.amount | currency: 'IDR' : 'symbol' : '1.0-0' : 'id' }}
                  </td>
                  <td class="bx-td-right">
                    <button type="button" class="bx-btn bx-btn--danger bx-btn--sm" (click)="remove(s)">
                      Delete
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class ShowtimesAdminComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.group({
    movieId: ['', Validators.required],
    theaterId: ['', Validators.required],
    startsAt: ['', Validators.required],
    priceAmount: [50000, [Validators.required, Validators.min(0)]],
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly refreshKey = signal(0);

  protected readonly movies = resource({
    params: () => this.refreshKey(),
    loader: () => firstValueFrom(this.api.listMovies({ limit: 100 })),
  });
  protected readonly theaters = resource({
    params: () => this.refreshKey(),
    loader: () => firstValueFrom(this.api.listTheaters({ limit: 100 })),
  });
  protected readonly showtimes = resource({
    params: () => this.refreshKey(),
    loader: () => firstValueFrom(this.api.listShowtimes({ limit: 100 })),
  });

  submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.value as {
      movieId: string;
      theaterId: string;
      startsAt: string;
      priceAmount: number;
    };
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createShowtime({
        movieId: raw.movieId,
        theaterId: raw.theaterId,
        startsAt: raw.startsAt,
        price: { amount: Number(raw.priceAmount), currency: 'IDR' },
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset({ priceAmount: 50000 });
          this.refreshKey.update((n) => n + 1);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || err?.error?.error || 'Create failed');
        },
      });
  }

  remove(showtime: Showtime): void {
    if (!confirm('Delete this showtime?')) return;
    this.api.deleteShowtime(showtime.id).subscribe({
      next: () => this.refreshKey.update((n) => n + 1),
      error: (err) => this.error.set(err?.error?.message || err?.message || 'Delete failed'),
    });
  }
}