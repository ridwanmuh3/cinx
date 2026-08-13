import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ThemeToggleComponent } from './shared/theme-toggle.component';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeToggleComponent],
  template: `
    <a class="bx-skip-link" href="#main">Skip to content</a>
    <header class="bx-bar">
      <div class="bx-bar-inner">
        <a class="bx-brand" routerLink="/" aria-label="CinX home">
          <span class="bx-brand-mark" aria-hidden="true"></span>
          <span class="bx-brand-name">CINX</span>
        </a>
        <nav class="bx-bar-nav" aria-label="Primary">
          @if (admin()) {
            <a
              #adminLink="routerLinkActive"
              routerLinkActive="bx-bar-link--active"
              class="bx-bar-link"
              routerLink="/admin"
              [attr.aria-current]="adminLink.isActive ? 'page' : null"
              >Admin</a
            >
          }
          <a
            #cinemaLink="routerLinkActive"
            routerLinkActive="bx-bar-link--active"
            class="bx-bar-link"
            routerLink="/movies"
            [attr.aria-current]="cinemaLink.isActive ? 'page' : null"
            >Cinema</a
          >
          <a
            #bookingsLink="routerLinkActive"
            routerLinkActive="bx-bar-link--active"
            class="bx-bar-link"
            routerLink="/bookings"
            [attr.aria-current]="bookingsLink.isActive ? 'page' : null"
            >My Bookings</a
          >
        </nav>
        <div class="bx-bar-side">
          <app-theme-toggle />
          @if (user()) {
            <span
              class="bx-bar-user"
              [attr.aria-label]="'Signed in as ' + (user()?.name || user()?.email)"
            >
              {{ user()?.name || user()?.email }}
            </span>
          }
          @if (authenticated()) {
            <button class="bx-bar-link-ghost" type="button" (click)="auth.logout()">Logout</button>
          } @else {
            <a class="bx-bar-link-ghost" routerLink="/login">Login</a>
          }
        </div>
      </div>
    </header>
    <main id="main" class="bx-page">
      <div class="bx-frame">
        <router-outlet />
      </div>
    </main>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly authenticated = this.auth.isAuthenticated;
  protected readonly admin = this.auth.isAdmin;
}
