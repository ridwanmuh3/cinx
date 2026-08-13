import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggleComponent],
  template: `
    <section class="bx-auth">
      <div class="bx-auth-card">
        <div class="bx-auth-head">
          <a class="bx-brand" routerLink="/" aria-label="CinX home">
            <span class="bx-brand-mark" aria-hidden="true"></span>
            <span class="bx-brand-name">CINX</span>
          </a>
          <app-theme-toggle />
        </div>
        <h1 class="bx-auth-title">Sign in</h1>
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="bx-form-grid">
          <div class="bx-field bx-span-2">
            <label class="bx-field-label" for="email">Email</label>
            <input
              id="email"
              class="bx-input"
              type="email"
              formControlName="email"
              autocomplete="email"
              aria-required="true"
              [attr.aria-invalid]="form.controls.email.touched && form.controls.email.invalid"
              [attr.aria-describedby]="
                form.controls.email.touched && form.controls.email.invalid ? 'email-err' : null
              "
            />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <p id="email-err" class="bx-err">Enter a valid email.</p>
            }
          </div>
          <div class="bx-field bx-span-2">
            <label class="bx-field-label" for="password">Password</label>
            <input
              id="password"
              class="bx-input"
              type="password"
              formControlName="password"
              autocomplete="current-password"
              aria-required="true"
              [attr.aria-invalid]="form.controls.password.touched && form.controls.password.invalid"
              [attr.aria-describedby]="
                form.controls.password.touched && form.controls.password.invalid
                  ? 'password-err'
                  : null
              "
            />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <p id="password-err" class="bx-err">Password is required.</p>
            }
          </div>
          @if (error()) {
            <p role="alert" class="bx-err bx-span-2">{{ error() }}</p>
          }
          <div class="bx-span-2">
            <button
              type="submit"
              [disabled]="form.invalid || loading()"
              class="bx-btn bx-btn--primary bx-btn--block"
            >
              @if (loading()) {
                Signing in…
              } @else {
                Sign in
              }
            </button>
          </div>
        </form>
        <p class="bx-auth-switch">
          Don't have an account?
          <a routerLink="/register">Register</a>
        </p>
      </div>
    </section>
  `,
})
export class LoginComponent {
  protected readonly form = inject(FormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const redirect = this.route.snapshot.queryParamMap.get('redirect') ?? undefined;
    this.auth.login(this.form.value as { email: string; password: string }, redirect).subscribe({
      error: (err) => this.error.set(err?.error?.message || err?.message || 'Login failed'),
      complete: () => this.loading.set(false),
    });
  }
}
