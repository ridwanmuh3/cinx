import { Component, inject, resource, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Theater } from '../../core/models';

@Component({
  selector: 'app-theaters-admin',
  imports: [ReactiveFormsModule],
  template: `
    <div class="bx-panel mb-6">
      <div class="bx-panel-head">
        <h2 class="bx-panel-title">Create theater</h2>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()" class="bx-form-grid bx-panel-body">
        <div class="bx-field">
          <label class="bx-field-label" for="th-name">Name</label>
          <input
            id="th-name"
            class="bx-input"
            formControlName="name"
            required
            [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid"
            [attr.aria-describedby]="
              form.controls.name.touched && form.controls.name.invalid ? 'th-name-err' : null
            "
          />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <p id="th-name-err" class="bx-err">Name is required.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="th-address">Address</label>
          <input
            id="th-address"
            class="bx-input"
            formControlName="address"
            required
            [attr.aria-invalid]="form.controls.address.touched && form.controls.address.invalid"
            [attr.aria-describedby]="
              form.controls.address.touched && form.controls.address.invalid ? 'th-address-err' : null
            "
          />
          @if (form.controls.address.touched && form.controls.address.invalid) {
            <p id="th-address-err" class="bx-err">Address is required.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="th-rows">Rows (A–Z)</label>
          <input
            id="th-rows"
            class="bx-input"
            type="number"
            min="1"
            max="26"
            formControlName="rows"
            required
            [attr.aria-invalid]="form.controls.rows.touched && form.controls.rows.invalid"
            [attr.aria-describedby]="
              form.controls.rows.touched && form.controls.rows.invalid ? 'th-rows-err' : null
            "
          />
          @if (form.controls.rows.touched && form.controls.rows.invalid) {
            <p id="th-rows-err" class="bx-err">Enter 1–26 rows.</p>
          }
        </div>
        <div class="bx-field">
          <label class="bx-field-label" for="th-cols">Columns</label>
          <input
            id="th-cols"
            class="bx-input"
            type="number"
            min="1"
            max="20"
            formControlName="cols"
            required
            [attr.aria-invalid]="form.controls.cols.touched && form.controls.cols.invalid"
            [attr.aria-describedby]="
              form.controls.cols.touched && form.controls.cols.invalid ? 'th-cols-err' : null
            "
          />
          @if (form.controls.cols.touched && form.controls.cols.invalid) {
            <p id="th-cols-err" class="bx-err">Enter 1–20 columns.</p>
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

    @if (theaters.isLoading()) {
      <div class="bx-loading">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Loading…
      </div>
    } @else if (theaters.hasValue()) {
      @let page = theaters.value()!;
      @if (page.items.length === 0) {
        <div class="bx-empty">
          <p class="bx-empty-title">No theaters yet</p>
          <p class="bx-empty-copy">Create the first theater above — it will appear here.</p>
        </div>
      } @else {
        <div class="bx-scroll">
          <table class="bx-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Address</th>
                <th scope="col">Seats</th>
                <th scope="col" class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (t of page.items; track t.id) {
                <tr>
                  <td class="bx-td-data">{{ t.name }}</td>
                  <td class="bx-td-data text-bone-dim">{{ t.address }}</td>
                  <td class="bx-td-data">{{ t.seats.length }}</td>
                  <td class="bx-td-right">
                    <button type="button" class="bx-btn bx-btn--danger bx-btn--sm" (click)="remove(t)">
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
export class TheatersAdminComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    address: ['', [Validators.required, Validators.maxLength(300)]],
    rows: [8, [Validators.required, Validators.min(1), Validators.max(26)]],
    cols: [12, [Validators.required, Validators.min(1), Validators.max(20)]],
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly refreshKey = signal(0);

  protected readonly theaters = resource({
    params: () => this.refreshKey(),
    loader: () => firstValueFrom(this.api.listTheaters({ limit: 100 })),
  });

  submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.value as { name: string; address: string; rows: number; cols: number };
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createTheater({
        name: raw.name,
        address: raw.address,
        layout: { rows: Number(raw.rows), cols: Number(raw.cols) },
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset({ rows: 8, cols: 12 });
          this.refreshKey.update((n) => n + 1);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || err?.message || 'Create failed');
        },
      });
  }

  remove(theater: Theater): void {
    if (!confirm(`Delete "${theater.name}"?`)) return;
    this.api.deleteTheater(theater.id).subscribe({
      next: () => this.refreshKey.update((n) => n + 1),
      error: (err) => this.error.set(err?.error?.message || err?.message || 'Delete failed'),
    });
  }
}
