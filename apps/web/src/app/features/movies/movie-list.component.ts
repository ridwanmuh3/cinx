import { Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Movie } from '../../core/models';

@Component({
  selector: 'app-movie-list',
  imports: [RouterLink],
  template: `
    <div class="bx-page-head">
      <h1 class="bx-h1">Now showing</h1>
      <button class="bx-btn bx-btn--sm bx-btn--ghost" type="button" (click)="nowPlaying.set(!nowPlaying())">
        @if (nowPlaying()) {
          Show all
        } @else {
          Now showing only
        }
      </button>
    </div>

    @if (movies.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading movies…
      </div>
    } @else if (movies.hasValue()) {
      @let list = movies.value()!;
      @if (list.items.length === 0) {
        <div class="bx-empty">
          <p class="bx-empty-title">No movies found</p>
        </div>
      }
      <div class="bx-grid">
        @for (movie of list.items; track movie.id) {
          <a [routerLink]="['/movies', movie.id]" class="bx-card">
            <div class="bx-card-poster">
              @if (movie.posterUrl) {
                <img
                  [src]="movie.posterUrl"
                  [alt]="movie.title"
                  width="360"
                  height="540"
                  loading="lazy"
                />
              } @else {
                <div class="bx-card-poster-empty">No poster</div>
              }
            </div>
            <div class="bx-card-body">
              <h2 class="bx-card-title">{{ movie.title }}</h2>
              <p class="bx-card-meta bx-data">
                {{ movie.durationMinutes }} min · {{ movie.ageRating }}
              </p>
              <p class="bx-card-syn">{{ movie.synopsis }}</p>
            </div>
          </a>
        }
      </div>
    } @else if (movies.error()) {
      <p role="alert" class="bx-err">{{ movies.error()?.message || 'Could not load movies.' }}</p>
    }
  `,
})
export class MovieListComponent {
  private readonly api = inject(ApiService);

  protected readonly nowPlaying = signal(true);

  protected readonly movies = resource({
    params: () => this.nowPlaying(),
    loader: ({ params }) =>
      firstValueFrom(params ? this.api.listMovies({ nowPlaying: true }) : this.api.listMovies()),
  });
}
