import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

@Component({
  selector: 'app-register',
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
        <h1 class="bx-auth-title">Create your account</h1>
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="bx-form-grid">
          <div class="bx-field bx-span-2">
            <label class="bx-field-label" for="name">Name</label>
            <input
              id="name"
              class="bx-input"
              type="text"
              formControlName="name"
              autocomplete="name"
              aria-required="true"
              [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid"
              [attr.aria-describedby]="
                form.controls.name.touched && form.controls.name.invalid ? 'name-err' : null
              "
            />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <p id="name-err" class="bx-err">Name is required.</p>
            }
          </div>
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
              autocomplete="new-password"
              aria-required="true"
              [attr.aria-invalid]="form.controls.password.touched && form.controls.password.invalid"
              [attr.aria-describedby]="
                form.controls.password.touched && form.controls.password.invalid
                  ? 'password-err'
                  : null
              "
            />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <p id="password-err" class="bx-err">Password must be 8–72 characters.</p>
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
                Creating account…
              } @else {
                Register
              }
            </button>
          </div>
        </form>
        <p class="bx-auth-switch">
          Already have an account?
          <a routerLink="/login">Sign in</a>
        </p>
      </div>
    </section>
  `,
})
export class RegisterComponent {
  protected readonly form = inject(FormBuilder).group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  private readonly auth = inject(AuthService);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth
      .register(this.form.value as { name: string; email: string; password: string })
      .subscribe({
        next: () => this.loading.set(false),
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || err?.message || 'Registration failed');
        },
      });
  }
}
