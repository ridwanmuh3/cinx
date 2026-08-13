import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'cinx-theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Resolved theme: persisted override, else the system preference. */
  readonly theme = signal<Theme>(this.resolveInitial());

  private media = window.matchMedia('(prefers-color-scheme: light)');
  private overridden =
    localStorage.getItem(STORAGE_KEY) === 'light' || localStorage.getItem(STORAGE_KEY) === 'dark';

  constructor() {
    // Keep the <html data-theme> attribute in sync on every change.
    effect(() => this.apply(this.theme()));

    // Follow the OS theme live only while the user has not pinned a choice.
    this.media.addEventListener('change', () => {
      if (!this.overridden) this.theme.set(systemTheme());
    });
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.overridden = true;
    localStorage.setItem(STORAGE_KEY, next);
    this.theme.set(next);
  }

  private resolveInitial(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* ignore storage errors */
    }
    return systemTheme();
  }

  private apply(theme: Theme): void {
    document.documentElement.dataset['theme'] = theme;
  }
}
