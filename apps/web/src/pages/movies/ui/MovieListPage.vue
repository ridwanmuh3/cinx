<script setup lang="ts">
import { ref, watch } from 'vue';
import * as api from '@/shared/api';
import { describeApiError } from '@/shared/lib/api-errors';
import type { Movie } from '@/shared/api/types';

const nowPlaying = ref(true);
const movies = ref<Movie[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

watch(
  nowPlaying,
  () => {
    load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const page = await api.listMovies(nowPlaying.value ? { nowPlaying: true } : {});
    movies.value = page.items;
  } catch (err) {
    error.value = describeApiError(err, 'Could not load movies. Check your connection and try again.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="bx-page-head">
    <h1 class="bx-h1">{{ nowPlaying ? 'Now showing' : 'All movies' }}</h1>
    <div class="bx-segmented" role="group" aria-label="Movie catalog filter">
      <button
        type="button"
        class="bx-segmented-item"
        :aria-pressed="nowPlaying"
        @click="nowPlaying = true"
      >
        Now showing
      </button>
      <button
        type="button"
        class="bx-segmented-item"
        :aria-pressed="!nowPlaying"
        @click="nowPlaying = false"
      >
        All movies
      </button>
    </div>
  </div>

  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading movies…
  </div>

  <div v-else-if="error" role="alert" class="bx-alert bx-alert--error">
    <span class="bx-alert-icon" aria-hidden="true">!</span>
    <span>{{ error }}</span>
  </div>

  <template v-else>
    <div v-if="movies.length === 0" class="bx-empty">
      <p class="bx-empty-title">
        {{ nowPlaying ? 'No movies are showing right now' : 'No movies in the catalog yet' }}
      </p>
      <p class="bx-empty-copy">
        {{
          nowPlaying
            ? 'Upcoming releases may already be listed — check the full catalog.'
            : 'Check back soon; new films are added as they are scheduled.'
        }}
      </p>
      <button
        v-if="nowPlaying"
        type="button"
        class="bx-btn bx-btn--ghost bx-btn--sm"
        @click="nowPlaying = false"
      >
        View all movies
      </button>
    </div>
    <div class="bx-grid">
      <router-link
        v-for="movie in movies"
        :key="movie.id"
        :to="`/movies/${movie.id}`"
        class="bx-card"
      >
        <div class="bx-card-poster">
          <img
            v-if="movie.posterUrl"
            :src="movie.posterUrl"
            :alt="movie.title"
            width="360"
            height="540"
            loading="lazy"
          />
          <div v-else class="bx-card-poster-empty">No poster</div>
        </div>
        <div class="bx-card-body">
          <h2 class="bx-card-title">{{ movie.title }}</h2>
          <p class="bx-card-meta bx-data">
            {{ movie.durationMinutes }} min · {{ movie.ageRating }}
          </p>
          <p class="bx-card-syn">{{ movie.synopsis }}</p>
        </div>
      </router-link>
    </div>
  </template>
</template>

<style scoped>
.bx-segmented {
  display: inline-flex;
  border: 1px solid var(--line);
  background: var(--bg-panel);
}

.bx-segmented-item {
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  font-family: var(--font-board);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.bx-segmented-item + .bx-segmented-item {
  border-left: 1px solid var(--line);
}

.bx-segmented-item:hover {
  color: var(--text);
}

.bx-segmented-item[aria-pressed='true'] {
  background: var(--amber-soft);
  color: var(--amber);
  box-shadow: inset 0 -2px 0 var(--amber);
}
</style>
