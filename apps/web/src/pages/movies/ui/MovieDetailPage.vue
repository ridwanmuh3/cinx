<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NSelect } from 'naive-ui';
import * as api from '@/shared/api';
import { describeApiError } from '@/shared/lib/api-errors';
import { formatDateTime, formatMediumDate, formatPrice } from '@/shared/lib/format';
import type { Movie, Showtime } from '@/shared/api/types';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ''));

const movie = ref<Movie | null>(null);
const showtimes = ref<Showtime[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedTheaterId = ref('');
const scanning = ref(false);
const notice = ref<string | null>(null);

watch(
  id,
  () => {
    load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  notice.value = null;
  movie.value = null;
  showtimes.value = [];
  try {
    const [m, page] = await Promise.all([
      api.getMovie(id.value),
      api.listShowtimes({ movieId: id.value, limit: 100 }),
    ]);
    movie.value = m;
    showtimes.value = page.items;
  } catch (err) {
    error.value = describeApiError(err, 'Could not load this movie.');
  } finally {
    loading.value = false;
  }
}

const theaters = computed(() => {
  const byId = new Map<string, Showtime['theater']>();
  for (const s of showtimes.value) byId.set(s.theater.id, s.theater);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
});

const theaterOptions = computed(() => [
  { label: 'All cinemas', value: '' },
  ...theaters.value.map((t) => ({ label: t.name, value: t.id })),
]);

const filteredShowtimes = computed(() =>
  selectedTheaterId.value
    ? showtimes.value.filter((s) => s.theater.id === selectedTheaterId.value)
    : showtimes.value,
);

/** Showtimes grouped by calendar day, in chronological order. */
const dayGroups = computed(() => {
  const groups = new Map<string, { dayLabel: string; isToday: boolean; showtimes: Showtime[] }>();
  const today = new Date();
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = dayKey(today);
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const sorted = [...filteredShowtimes.value].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  for (const s of sorted) {
    const d = new Date(s.startsAt);
    const key = dayKey(d);
    if (!groups.has(key)) {
      groups.set(key, {
        dayLabel: `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`,
        isToday: key === todayKey,
        showtimes: [],
      });
    }
    groups.get(key)!.showtimes.push(s);
  }
  return [...groups.values()];
});

/**
 * The hero CTA checks live seat maps before navigating, so "Book tickets"
 * can never drop the user into a dead seat map — it lands on the first
 * showtime that genuinely has an open seat, and says so when none does.
 */
async function bookTickets(): Promise<void> {
  if (scanning.value) return;
  scanning.value = true;
  notice.value = null;
  try {
    const candidates = filteredShowtimes.value.filter((s) => s.availableSeats > 0);
    for (const s of candidates) {
      try {
        const map = await api.getSeatMap(s.id);
        if (map.seats.some((seat) => !seat.isDisabled && seat.status === 'AVAILABLE')) {
          await router.push(`/showtimes/${s.id}/seats`);
          return;
        }
      } catch {
        // Probe is best-effort; try the next showtime.
      }
    }
    notice.value =
      candidates.length === 0
        ? 'Every showtime for this film is fully booked. Please check back later.'
        : 'We could not find an open seat just now — the list below shows live availability.';
  } finally {
    scanning.value = false;
  }
}
</script>

<template>
  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading…
  </div>

  <div v-else-if="error" role="alert" class="bx-alert bx-alert--error">
    <span class="bx-alert-icon" aria-hidden="true">!</span>
    <span>{{ error }}</span>
  </div>

  <template v-else-if="movie">
    <div class="bx-detail-layout">
      <div v-if="movie.posterUrl" class="bx-poster-frame">
        <img :src="movie.posterUrl" :alt="movie.title" width="440" height="660" loading="lazy" />
      </div>
      <div v-else class="bx-poster-frame bx-poster-frame--empty">No poster</div>
      <div>
        <h1 class="bx-h1">{{ movie.title }}</h1>
        <div class="bx-detail-meta">
          <span class="bx-data text-sm text-bone-dim"
            >{{ movie.durationMinutes }} min · {{ movie.ageRating }}</span
          >
          <span class="bx-data text-sm text-bone-dim">·</span>
          <span class="bx-chip">Releases {{ formatMediumDate(movie.releaseDate) }}</span>
        </div>
        <p v-if="movie.genres.length" class="bx-label mb-2">Genres</p>
        <p v-if="movie.genres.length" class="bx-data text-sm text-bone mb-4">
          {{ movie.genres.join(', ') }}
        </p>
        <p class="bx-detail-copy">{{ movie.synopsis }}</p>
        <button
          v-if="filteredShowtimes.length"
          type="button"
          class="bx-btn bx-btn--primary mt-6"
          :disabled="scanning"
          @click="bookTickets"
        >
          {{ scanning ? 'Finding seats…' : 'Book tickets' }}
        </button>
        <p v-if="notice" role="status" class="bx-dim mt-3">{{ notice }}</p>
      </div>
    </div>

    <section id="showtimes" class="bx-section-gap">
      <h2 class="bx-h2 mb-4">Showtimes</h2>
      <div v-if="showtimes.length" class="bx-field bx-filter">
        <label class="bx-field-label" for="theater-filter">Choose cinema</label>
        <n-select
          id="theater-filter"
          v-model:value="selectedTheaterId"
          :options="theaterOptions"
          placeholder="All cinemas"
          data-testid="theater-filter"
        />
      </div>
      <template v-if="filteredShowtimes.length">
        <div class="bx-panel">
          <template v-for="group in dayGroups" :key="group.dayLabel">
            <p class="bx-day-rule" :class="{ 'bx-day-rule--today': group.isToday }">
              {{ group.isToday ? `Today · ${group.dayLabel}` : group.dayLabel }}
            </p>
            <div v-for="s in group.showtimes" :key="s.id" class="bx-row">
              <div>
                <p class="bx-row-title">{{ s.theater.name }}</p>
                <p class="bx-row-meta">
                  {{ formatDateTime(s.startsAt) }} ·
                  <span class="text-green">{{ s.availableSeats }} seats left</span> ·
                  {{ formatPrice(s.price.amount) }} / seat
                </p>
              </div>
              <router-link
                :to="`/showtimes/${s.id}/seats`"
                class="bx-btn bx-btn--ghost bx-btn--sm"
                :class="{ 'bx-btn--disabled': s.availableSeats === 0 }"
                :aria-disabled="s.availableSeats === 0"
              >
                {{ s.availableSeats === 0 ? 'Sold out' : 'Select seats' }}
              </router-link>
            </div>
          </template>
        </div>
      </template>
      <p v-else class="bx-dim">No upcoming showtimes.</p>
    </section>
  </template>
</template>
