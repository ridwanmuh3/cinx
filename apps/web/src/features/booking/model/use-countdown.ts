import { computed, onBeforeUnmount, ref, type Ref } from 'vue';

/**
 * Ticks a 1 Hz countdown against a reactive ISO timestamp (e.g. a seat-hold
 * `expiresAt`). The source ref is caller-owned: pass a plain ref and set it
 * when a hold starts, or a computed that reacts to loaded data. Shared by
 * the seat picker and checkout pages.
 */
export function useCountdown(expiresAt: Ref<string | null | undefined>) {
  const remainingMs = ref<number | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    const target = expiresAt.value ? new Date(expiresAt.value).getTime() : null;
    remainingMs.value = target === null ? null : Math.max(0, target - Date.now());
  }

  /** Begins (or restarts) the 1 Hz ticking against the current source. */
  function start(): void {
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    remainingMs.value = null;
  }

  onBeforeUnmount(stop);

  const countdownText = computed(() => {
    const ms = remainingMs.value;
    if (ms === null) return '--:--';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  const expired = computed(() => remainingMs.value !== null && remainingMs.value <= 0);
  const warning = computed(
    () => remainingMs.value !== null && remainingMs.value > 0 && remainingMs.value < 60000,
  );

  return { remainingMs, countdownText, expired, warning, start, stop };
}
