import { Component, inject, resource, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Movie, MovieCreateRequest } from '../../core/models';

@Component({
  selector: 'app-movies-admin',
  imports: [ReactiveFormsModule],
  template: `
    <div class="bx-panel mb-6">
      <div class="bx-panel-head">
        <h2 class="bx-panel-title">{{ editing() ? 'Edit movie' : 'Create movie' }}</h2>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()" class="bx-form-grid bx-panel-body">
        <div class="bx-field">
          <label class="bx-field-label" for="mv-title">Title</label>
          <input
            id="mv-title"
            class="bx-input"
            formControlName="title"
            required
            [attr.aria-invalid]="form.controls.title.touched && form.controls.title.invalid"
            [attr.aria-describedby]="
              form.controls.title.touched && form.controls.title.invalid ? 'mv-title-err' : null
            "
          />
          @if (form.controls.title.touched && form.controls.title.invalid) {
            <p id="mv-title-err" class="bx-err">Title is required.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="mv-genres">Genres (comma separated)</label>
          <input
            id="mv-genres"
            class="bx-input"
            formControlName="genres"
            required
            [attr.aria-invalid]="form.controls.genres.touched && form.controls.genres.invalid"
            [attr.aria-describedby]="
              form.controls.genres.touched && form.controls.genres.invalid ? 'mv-genres-err' : null
            "
          />
          @if (form.controls.genres.touched && form.controls.genres.invalid) {
            <p id="mv-genres-err" class="bx-err">At least one genre is required.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="mv-duration">Duration (min)</label>
          <input
            id="mv-duration"
            class="bx-input"
            type="number"
            formControlName="durationMinutes"
            required
            [attr.aria-invalid]="
              form.controls.durationMinutes.touched && form.controls.durationMinutes.invalid
            "
            [attr.aria-describedby]="
              form.controls.durationMinutes.touched && form.controls.durationMinutes.invalid
                ? 'mv-duration-err'
                : null
            "
          />
          @if (form.controls.durationMinutes.touched && form.controls.durationMinutes.invalid) {
            <p id="mv-duration-err" class="bx-err">Enter a positive duration.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="mv-rating">Age rating</label>
          <select id="mv-rating" class="bx-select" formControlName="ageRating" required>
            <option value="SU">SU</option>
            <option value="BO">BO</option>
            <option value="13+">13+</option>
            <option value="17+">17+</option>
            <option value="21+">21+</option>
          </select>
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="mv-release">Release date</label>
          <input
            id="mv-release"
            class="bx-input"
            type="date"
            formControlName="releaseDate"
            required
            [attr.aria-invalid]="
              form.controls.releaseDate.touched && form.controls.releaseDate.invalid
            "
            [attr.aria-describedby]="
              form.controls.releaseDate.touched && form.controls.releaseDate.invalid
                ? 'mv-release-err'
                : null
            "
          />
          @if (form.controls.releaseDate.touched && form.controls.releaseDate.invalid) {
            <p id="mv-release-err" class="bx-err">Release date is required.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="mv-poster">Poster URL</label>
          <input
            id="mv-poster"
            class="bx-input"
            formControlName="posterUrl"
            placeholder="https://…"
          />
        </div>
        <div class="bx-field bx-span-2">
          <label class="bx-field-label" for="mv-synopsis">Synopsis</label>
          <textarea
            id="mv-synopsis"
            class="bx-textarea"
            rows="2"
            formControlName="synopsis"
            required
            [attr.aria-invalid]="form.controls.synopsis.touched && form.controls.synopsis.invalid"
            [attr.aria-describedby]="
              form.controls.synopsis.touched && form.controls.synopsis.invalid
                ? 'mv-synopsis-err'
                : null
            "
          ></textarea>
          @if (form.controls.synopsis.touched && form.controls.synopsis.invalid) {
            <p id="mv-synopsis-err" class="bx-err">Synopsis is required.</p>
          }
        </div>
        <div class="bx-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            class="bx-btn bx-btn--primary"
            [disabled]="form.invalid || saving()"
          >
            {{ saving() ? 'Saving…' : editing() ? 'Update' : 'Create' }}
          </button>
          @if (editing()) {
            <button type="button" class="bx-btn bx-btn--ghost" (click)="cancelEdit()">
              Cancel
            </button>
          }
        </div>
        @if (error()) {
          <p role="alert" class="bx-err bx-span-2">{{ error() }}</p>
        }
      </form>
    </div>

    @if (movies.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading…
      </div>
    } @else if (movies.hasValue()) {
      @let page = movies.value()!;
      @if (page.items.length === 0) {
        <div class="bx-empty">
          <p class="bx-empty-title">No movies yet</p>
          <p class="bx-empty-copy">Create the first movie above — it will appear here.</p>
        </div>
      } @else {
        <div class="bx-scroll">
          <table class="bx-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Genres</th>
                <th scope="col">Duration</th>
                <th scope="col">Rating</th>
                <th scope="col" class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (m of page.items; track m.id) {
                <tr>
                  <td class="bx-td-data">{{ m.title }}</td>
                  <td class="bx-td-data text-bone-dim">{{ m.genres.join(', ') || '—' }}</td>
                  <td class="bx-td-data">{{ m.durationMinutes }} min</td>
                  <td class="bx-td-data">{{ m.ageRating }}</td>
                  <td class="bx-td-right">
                    <button type="button" class="bx-btn bx-btn--ghost bx-btn--sm" (click)="startEdit(m)">
                      Edit
                    </button>
                    <button type="button" class="bx-btn bx-btn--danger bx-btn--sm ml-2" (click)="remove(m)">
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
export class MoviesAdminComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    genres: ['', Validators.required],
    durationMinutes: ['', [Validators.required, Validators.min(1)]],
    ageRating: ['SU', Validators.required],
    releaseDate: ['', Validators.required],
    posterUrl: [''],
    synopsis: ['', Validators.required],
    status: ['COMING_SOON'],
  });

  protected readonly editing = signal<Movie | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly refreshKey = signal(0);

  protected readonly movies = resource({
    params: () => this.refreshKey(),
    loader: () => firstValueFrom(this.api.listMovies({ limit: 100 })),
  });

  startEdit(movie: Movie): void {
    this.editing.set(movie);
    this.error.set(null);
    this.form.patchValue({
      title: movie.title,
      genres: movie.genres.join(', '),
      durationMinutes: String(movie.durationMinutes),
      ageRating: movie.ageRating,
      releaseDate: movie.releaseDate,
      posterUrl: movie.posterUrl ?? '',
      synopsis: movie.synopsis,
      status: movie.status,
    });
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.form.reset({ ageRating: 'SU', status: 'COMING_SOON' });
  }

  submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.value as unknown as {
      title: string;
      genres: string;
      durationMinutes: string;
      ageRating: Movie['ageRating'];
      releaseDate: string;
      posterUrl: string;
      synopsis: string;
      status: Movie['status'];
    };
    const payload: MovieCreateRequest = {
      title: raw.title,
      synopsis: raw.synopsis,
      genres: raw.genres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      durationMinutes: Number(raw.durationMinutes),
      ageRating: raw.ageRating,
      posterUrl: raw.posterUrl || null,
      releaseDate: raw.releaseDate,
      status: raw.status,
    };
    this.saving.set(true);
    this.error.set(null);
    const current = this.editing();
    const op = current ? this.api.updateMovie(current.id, payload) : this.api.createMovie(payload);
    op.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.form.reset({ ageRating: 'SU', status: 'COMING_SOON' });
        this.refreshKey.update((n) => n + 1);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || err?.message || 'Save failed');
      },
    });
  }

  remove(movie: Movie): void {
    if (!confirm(`Delete "${movie.title}"?`)) return;
    this.api.deleteMovie(movie.id).subscribe({
      next: () => this.refreshKey.update((n) => n + 1),
      error: (err) => this.error.set(err?.error?.message || err?.message || 'Delete failed'),
    });
  }
}
