import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <h1 class="bx-h1 mb-5">Operator console</h1>
    <nav class="bx-tabs" aria-label="Admin">
      <a
        #moviesTab="routerLinkActive"
        routerLinkActive="bx-tab--active"
        [attr.aria-current]="moviesTab.isActive ? 'page' : null"
        class="bx-tab"
        routerLink="/admin/movies"
        >Movies</a
      >
      <a
        #theatersTab="routerLinkActive"
        routerLinkActive="bx-tab--active"
        [attr.aria-current]="theatersTab.isActive ? 'page' : null"
        class="bx-tab"
        routerLink="/admin/theaters"
        >Theaters</a
      >
      <a
        #showtimesTab="routerLinkActive"
        routerLinkActive="bx-tab--active"
        [attr.aria-current]="showtimesTab.isActive ? 'page' : null"
        class="bx-tab"
        routerLink="/admin/showtimes"
        >Showtimes</a
      >
    </nav>
    <router-outlet />
  `,
})
export class AdminLayoutComponent {}
