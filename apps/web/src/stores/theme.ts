import { ref } from 'vue';
import { defineStore } from 'pinia';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'cinx-theme';

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    // matchMedia is unavailable in jsdom and some older browsers; fall back to dark.
    return 'dark';
  }
}

function resolveInitial(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore storage errors */
  }
  return systemTheme();
}

export const useThemeStore = defineStore('theme', () => {
  /** Resolved theme: persisted override, else the system preference. */
  const theme = ref<Theme>(resolveInitial());
  /** True once the user has pinned a choice (stops following the OS theme). */
  const overridden = ref(false);

  function toggle(): void {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark';
    overridden.value = true;
    localStorage.setItem(STORAGE_KEY, next);
    theme.value = next;
  }

  return { theme, overridden, toggle };
});
