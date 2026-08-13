import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './shell.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'movies', pathMatch: 'full' },
      {
        path: 'movies',
        loadComponent: () =>
          import('./features/movies/movie-list.component').then((m) => m.MovieListComponent),
      },
      {
        path: 'movies/:id',
        loadComponent: () =>
          import('./features/movies/movie-detail.component').then((m) => m.MovieDetailComponent),
      },
      {
        path: 'showtimes/:id/seats',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/movies/seat-picker.component').then((m) => m.SeatPickerComponent),
      },
      {
        path: 'bookings',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/bookings/booking-history.component').then(
            (m) => m.BookingHistoryComponent,
          ),
      },
      {
        path: 'bookings/checkout',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/bookings/checkout.component').then((m) => m.CheckoutComponent),
      },
      {
        path: 'bookings/confirm/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/bookings/confirmation.component').then((m) => m.ConfirmationComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin-layout.component').then((m) => m.AdminLayoutComponent),
        children: [
          { path: '', redirectTo: 'movies', pathMatch: 'full' },
          {
            path: 'movies',
            loadComponent: () =>
              import('./features/admin/movies-admin.component').then((m) => m.MoviesAdminComponent),
          },
          {
            path: 'theaters',
            loadComponent: () =>
              import('./features/admin/theaters-admin.component').then(
                (m) => m.TheatersAdminComponent,
              ),
          },
          {
            path: 'showtimes',
            loadComponent: () =>
              import('./features/admin/showtimes-admin.component').then(
                (m) => m.ShowtimesAdminComponent,
              ),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
