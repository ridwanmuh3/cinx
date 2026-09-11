<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NSelect } from 'naive-ui';
import * as api from '@/api';
import { formatDateTime, formatMediumDate, formatPrice } from '@/format';
import type { Movie, Showtime, TheaterSummary } from '@/types';

const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const movie = ref<Movie | null>(null);
const showtimes = ref<Showtime[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedTheaterId = ref('');

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
    error.value = err instanceof Error ? err.message : 'Could not load this movie.';
  } finally {
    loading.value = false;
  }
}

const theaters = computed<TheaterSummary[]>(() => {
  const byId = new Map<string, TheaterSummary>();
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

const firstShowtimeId = computed(() => showtimes.value[0]?.id ?? null);
</script>

<template>
  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading…
  </div>

  <p v-else-if="error" role="alert" class="bx-err">{{ error }}</p>

  <template v-else-if="movie">
    <div class="bx-detail-layout">
      <div v-if="movie.posterUrl" class="bx-poster-frame">
        <img :src="movie.posterUrl" :alt="movie.title" width="440" height="660" loading="lazy" />
      </div>
      <div v-else class="bx-poster-frame bx-poster-frame--empty">No poster</div>
      <div>
        <h1 class="bx-h1">{{ movie.title }}</h1>
        <div class="bx-detail-meta">
          <span class="bx-data text-sm text-bone-dim">{{ movie.durationMinutes }} min · {{ movie.ageRating }}</span>
          <span class="bx-data text-sm text-bone-dim">·</span>
          <span class="bx-chip">Releases {{ formatMediumDate(movie.releaseDate) }}</span>
        </div>
        <p v-if="movie.genres.length" class="bx-label mb-2">Genres</p>
        <p v-if="movie.genres.length" class="bx-data text-sm text-bone mb-4">
          {{ movie.genres.join(', ') }}
        </p>
        <p class="bx-detail-copy">{{ movie.synopsis }}</p>
        <router-link
          v-if="firstShowtimeId"
          :to="`/showtimes/${firstShowtimeId}/seats`"
          class="bx-btn bx-btn--primary mt-6"
        >
          Book tickets
        </router-link>
      </div>
    </div>

    <section class="bx-section-gap">
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
          <div v-for="s in filteredShowtimes" :key="s.id" class="bx-row">
            <div>
              <p class="bx-row-title">{{ s.theater.name }}</p>
              <p class="bx-row-meta">
                {{ formatDateTime(s.startsAt) }} ·
                <span class="text-green">{{ s.availableSeats }} seats left</span> ·
                {{ formatPrice(s.price.amount) }} / seat
              </p>
            </div>
            <router-link :to="`/showtimes/${s.id}/seats`" class="bx-btn bx-btn--ghost bx-btn--sm">
              Select seats
            </router-link>
          </div>
        </div>
      </template>
      <p v-else class="bx-dim">No upcoming showtimes.</p>
    </section>
  </template>
</template>