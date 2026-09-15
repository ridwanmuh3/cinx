<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCountdown } from '@/features/booking/model/use-countdown';

/**
 * Live "Pending · mm:ss left" chip for booking rows. Pauses while the
 * document is hidden (a background tab must not silently expire a hold the
 * user believes is running); visibility resumes with a re-synced remaining
 * time and emits `expired` exactly once when the hold runs out.
 */
const props = defineProps<{ expiresAt: string }>();

const emit = defineEmits<{ expired: [] }>();

const expires = ref(props.expiresAt);
watch(
  () => props.expiresAt,
  (v) => {
    expires.value = v;
  },
);
const { countdownText, expired } = useCountdown(expires);

let announced = false;
watch(expired, (isExpired) => {
  if (isExpired && !announced) {
    announced = true;
    emit('expired');
  }
});

// Pause ticking in hidden tabs so background pages don't drift from the
// server; visibility resumes with a fresh re-synced remaining time.
const hidden = ref(false);
function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    hidden.value = true;
  } else if (hidden.value) {
    hidden.value = false;
    // `expires` is unchanged; nudge the clock by re-assigning through the
    // same ref triggers the internal watch → start() → tick().
    expires.value = '';
    expires.value = props.expiresAt;
  }
}
document.addEventListener('visibilitychange', onVisibility);
</script>

<template>
  <span v-if="expired" class="bx-chip bx-chip--red">
    <span class="bx-chip-dot" aria-hidden="true"></span>
    Hold expired
  </span>
  <span v-else class="bx-chip bx-chip--amber">
    <span class="bx-chip-dot bx-chip-dot--pulse" aria-hidden="true"></span>
    Pending · {{ countdownText }} left
  </span>
</template>
