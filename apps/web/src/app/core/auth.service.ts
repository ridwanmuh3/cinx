import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { inject, computed, signal, Signal } from '@angular/core';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { ApiService } from './api.service';
import { User } from './models';

const TOKEN_KEY = 'ticketing_access_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly userSignal = signal<User | null>(null);

  readonly token: Signal<string | null> = this.tokenSignal;
  readonly user: Signal<User | null> = this.userSignal;
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly isAdmin = computed(() => this.userSignal()?.role === 'admin');

  register(dto: { email: string; password: string; name?: string }): Observable<User> {
    return this.api.register(dto).pipe(
      tap((user) => {
        this.userSignal.set(user);
        this.router.navigate(['/login']);
      }),
    );
  }

  login(dto: { email: string; password: string }, redirect?: string): Observable<User> {
    return this.api.login(dto).pipe(
      tap((res) => {
        this.userSignal.set(res.user);
        this.tokenSignal.set(res.accessToken);
        localStorage.setItem(TOKEN_KEY, res.accessToken);
      }),
      tap(() => this.router.navigateByUrl(redirect || '/movies')),
      map((res) => res.user),
    );
  }

  /** Verifies the stored JWT and refreshes the current user (silent). */
  refreshMe(): Observable<User | null> {
    if (!this.tokenSignal()) {
      this.userSignal.set(null);
      return of(null);
    }
    return this.api.me().pipe(
      tap((user) => this.userSignal.set(user)),
      catchError(() => {
        this.clearLocal();
        return of(null);
      }),
    );
  }

  logout(): void {
    this.clearLocal();
    this.router.navigate(['/login']);
  }

  private clearLocal(): void {
    this.userSignal.set(null);
    this.tokenSignal.set(null);
    localStorage.removeItem(TOKEN_KEY);
  }
}
