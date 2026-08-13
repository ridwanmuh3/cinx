import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      class="theme-toggle"
      [attr.aria-pressed]="theme() === 'light'"
      [attr.aria-label]="theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
      (click)="themeService.toggle()"
    >
      <svg
        class="theme-toggle__icon theme-toggle__icon--sun"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"
        />
      </svg>
      <svg
        class="theme-toggle__icon theme-toggle__icon--moon"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a7 7 0 1 0 9.5 9.5Z" />
      </svg>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .theme-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 30px;
        padding: 4px 9px;
        border: 1px solid var(--line);
        background: transparent;
        color: var(--text-dim);
        transition:
          border-color 0.16s ease,
          color 0.16s ease,
          background-color 0.16s ease;
      }

      .theme-toggle:hover {
        border-color: var(--amber-dim);
        color: var(--text);
      }

      .theme-toggle__icon {
        display: none;
      }

      :host-context([data-theme='dark']) .theme-toggle__icon--sun {
        display: block;
      }

      :host-context([data-theme='light']) .theme-toggle__icon--moon {
        display: block;
      }
    `,
  ],
})
export class ThemeToggleComponent {
  protected readonly themeService = inject(ThemeService);
  protected readonly theme = this.themeService.theme;
}
