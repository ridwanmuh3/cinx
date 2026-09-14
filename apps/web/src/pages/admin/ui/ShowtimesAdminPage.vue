<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import {
  NButton,
  NDataTable,
  NDatePicker,
  NForm,
  NFormItem,
  NInputNumber,
  NSelect,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui';
import * as api from '@/shared/api';
import { formatMedium, formatPrice } from '@/shared/lib/format';
import type { Movie, Showtime, Theater } from '@/shared/api/types';

const formRef = ref<FormInst | null>(null);
const form = ref({
  movieId: null as string | null,
  theaterId: null as string | null,
  startsAt: null as string | null,
  priceAmount: 50000 as number | null,
});

const rules: FormRules = {
  movieId: [{ required: true, message: 'Choose a movie.', trigger: ['blur', 'change'] }],
  theaterId: [{ required: true, message: 'Choose a theater.', trigger: ['blur', 'change'] }],
  startsAt: [{ required: true, message: 'Choose a start time.', trigger: ['blur', 'change'] }],
  priceAmount: [
    {
      required: true,
      type: 'number',
      min: 0,
      message: 'Enter a price of 0 or more.',
      trigger: ['blur', 'change'],
    },
  ],
};

const saving = ref(false);
const error = ref<string | null>(null);
const refreshKey = ref(0);

const movies = ref<Movie[]>([]);
const theaters = ref<Theater[]>([]);
const showtimes = ref<Showtime[]>([]);
const loading = ref(true);

watch(
  refreshKey,
  () => {
    load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [m, t, s] = await Promise.all([
      api.listMovies({ limit: 100 }),
      api.listTheaters({ limit: 100 }),
      api.listShowtimes({ limit: 100 }),
    ]);
    movies.value = m.items;
    theaters.value = t.items;
    showtimes.value = s.items;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load showtimes.';
  } finally {
    loading.value = false;
  }
}

const movieOptions = computed(() => movies.value.map((m) => ({ label: m.title, value: m.id })));
const theaterOptions = computed(() => theaters.value.map((t) => ({ label: t.name, value: t.id })));

async function submit(): Promise<void> {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    await api.createShowtime({
      movieId: form.value.movieId ?? '',
      theaterId: form.value.theaterId ?? '',
      startsAt: new Date(form.value.startsAt ?? '').toISOString(),
      price: { amount: Number(form.value.priceAmount), currency: 'IDR' },
    });
    form.value = { movieId: null, theaterId: null, startsAt: null, priceAmount: 50000 };
    refreshKey.value += 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Create failed';
  } finally {
    saving.value = false;
  }
}

const dialog = useDialog();

function remove(showtime: Showtime): void {
  dialog.warning({
    title: 'Delete this showtime?',
    content: 'This cannot be undone.',
    positiveText: 'Confirm',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.deleteShowtime(showtime.id);
        refreshKey.value += 1;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Delete failed';
      }
    },
  });
}

const columns: DataTableColumns<Showtime> = [
  {
    title: 'Movie',
    key: 'movie',
    render: (row) => h('span', { class: 'bx-td-data' }, row.movie.title),
  },
  {
    title: 'Theater',
    key: 'theater',
    render: (row) => h('span', { class: 'bx-td-data text-bone-dim' }, row.theater.name),
  },
  {
    title: 'Starts at',
    key: 'startsAt',
    render: (row) => h('span', { class: 'bx-td-data' }, formatMedium(row.startsAt)),
  },
  {
    title: 'Price',
    key: 'price',
    render: (row) => h('span', { class: 'bx-td-data' }, formatPrice(row.price.amount)),
  },
  {
    title: 'Actions',
    key: 'actions',
    align: 'right',
    render: (row) =>
      h('div', { class: 'flex flex-wrap justify-end gap-2' }, [
        h(
          NButton,
          { size: 'small', type: 'error', quaternary: true, onClick: () => remove(row) },
          { default: () => 'Delete' },
        ),
      ]),
  },
];
</script>

<template>
  <div class="bx-panel mb-6">
    <div class="bx-panel-head">
      <h2 class="bx-panel-title">Create showtime</h2>
    </div>
    <n-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-placement="top"
      class="bx-form-grid bx-panel-body"
      @submit.prevent="submit"
    >
      <n-form-item label="Movie" path="movieId" data-testid="st-movie">
        <n-select
          v-model:value="form.movieId"
          :options="movieOptions"
          placeholder="Select a movie"
          data-testid="st-movie-select"
        />
      </n-form-item>
      <n-form-item label="Theater" path="theaterId" data-testid="st-theater">
        <n-select
          v-model:value="form.theaterId"
          :options="theaterOptions"
          placeholder="Select a theater"
          data-testid="st-theater-select"
        />
      </n-form-item>
      <n-form-item label="Starts at" path="startsAt" data-testid="st-starts">
        <n-date-picker
          id="st-starts-input"
          v-model:formatted-value="form.startsAt"
          type="datetime"
          format="yyyy-MM-dd HH:mm:ss"
          value-format="yyyy-MM-dd'T'HH:mm"
          class="w-full"
          data-testid="st-starts-input"
        />
      </n-form-item>
      <n-form-item label="Price (IDR)" path="priceAmount" data-testid="st-price">
        <n-input-number
          v-model:value="form.priceAmount"
          :min="0"
          :show-button="false"
          style="width: 100%"
          data-testid="st-price-input"
        />
      </n-form-item>
      <div class="bx-span-2 flex flex-wrap gap-2">
        <n-button type="primary" :loading="saving" attr-type="submit" class="bx-ctl-btn">
          {{ saving ? 'Saving…' : 'Create' }}
        </n-button>
      </div>
      <p v-if="error" role="alert" class="bx-err bx-span-2">{{ error }}</p>
    </n-form>
  </div>

  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading…
  </div>

  <div v-else-if="showtimes.length === 0" class="bx-empty">
    <p class="bx-empty-title">No showtimes yet</p>
    <p class="bx-empty-copy">Create the first showtime above — it will appear here.</p>
  </div>

  <div v-else class="bx-scroll">
    <n-data-table :columns="columns" :data="showtimes" :bordered="false" :single-line="false" />
  </div>
</template>
