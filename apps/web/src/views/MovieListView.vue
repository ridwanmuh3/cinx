<script setup lang="ts">
import { ref, watch } from 'vue';
import { NButton } from 'naive-ui';
import * as api from '@/api';
import type { Movie } from '@/types';

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
    error.value = err instanceof Error ? err.message : 'Could not load movies.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="bx-page-head">
    <h1 class="bx-h1">Now showing</h1>
    <n-button quaternary size="small" class="bx-ctl-btn" @click="nowPlaying = !nowPlaying">
      {{ nowPlaying ? 'Show all' : 'Now showing only' }}
    </n-button>
  </div>

  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading movies…
  </div>

  <template v-else-if="error">
    <p role="alert" class="bx-err">{{ error }}</p>
  </template>

  <template v-else>
    <div v-if="movies.length === 0" class="bx-empty">
      <p class="bx-empty-title">No movies found</p>
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
