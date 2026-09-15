<script setup lang="ts">
import { h, ref, watch } from 'vue';
import {
  NButton,
  NDataTable,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui';
import * as api from '@/shared/api';
import { describeApiError } from '@/shared/lib/api-errors';
import type { AgeRating, Movie, MovieCreateRequest } from '@/shared/api/types';

const formRef = ref<FormInst | null>(null);
const emptyForm = () => ({
  title: '',
  genres: '',
  durationMinutes: null as number | null,
  ageRating: 'SU' as AgeRating,
  releaseDate: null as string | null,
  posterUrl: '',
  synopsis: '',
  status: 'COMING_SOON' as Movie['status'],
});
const form = ref(emptyForm());

const rules: FormRules = {
  title: [{ required: true, max: 200, message: 'Title is required.', trigger: ['blur', 'input'] }],
  genres: [
    { required: true, message: 'At least one genre is required.', trigger: ['blur', 'input'] },
  ],
  durationMinutes: [
    {
      required: true,
      type: 'number',
      min: 1,
      message: 'Enter a positive duration.',
      trigger: ['blur', 'change'],
    },
  ],
  releaseDate: [
    { required: true, message: 'Release date is required.', trigger: ['blur', 'change'] },
  ],
  synopsis: [{ required: true, message: 'Synopsis is required.', trigger: ['blur', 'input'] }],
};

const editing = ref<Movie | null>(null);
const saving = ref(false);
const error = ref<string | null>(null);
const refreshKey = ref(0);

const movies = ref<Movie[]>([]);
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
    const page = await api.listMovies({ limit: 100 });
    movies.value = page.items;
  } catch (err) {
    error.value = describeApiError(err, 'Could not load movies.');
  } finally {
    loading.value = false;
  }
}

const ageOptions = (['SU', 'BO', '13+', '17+', '21+'] as const).map((v) => ({
  label: v,
  value: v,
}));

function startEdit(movie: Movie): void {
  editing.value = movie;
  error.value = null;
  form.value = {
    title: movie.title,
    genres: movie.genres.join(', '),
    durationMinutes: movie.durationMinutes,
    ageRating: movie.ageRating,
    posterUrl: movie.posterUrl ?? '',
    synopsis: movie.synopsis,
    status: movie.status,
    releaseDate: movie.releaseDate,
  };
}

function cancelEdit(): void {
  editing.value = null;
  form.value = emptyForm();
}

async function submit(): Promise<void> {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  const payload: MovieCreateRequest = {
    title: form.value.title,
    synopsis: form.value.synopsis,
    genres: form.value.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
    durationMinutes: Number(form.value.durationMinutes),
    ageRating: form.value.ageRating,
    posterUrl: form.value.posterUrl || null,
    releaseDate: form.value.releaseDate ?? '',
    status: form.value.status,
  };
  saving.value = true;
  error.value = null;
  try {
    if (editing.value) await api.updateMovie(editing.value.id, payload);
    else await api.createMovie(payload);
    editing.value = null;
    form.value = emptyForm();
    refreshKey.value += 1;
  } catch (err) {
    error.value = describeApiError(err, 'Could not save the movie. Please try again.');
  } finally {
    saving.value = false;
  }
}

const dialog = useDialog();

function remove(movie: Movie): void {
  dialog.warning({
    title: `Delete "${movie.title}"?`,
    content: 'This cannot be undone.',
    positiveText: 'Confirm',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.deleteMovie(movie.id);
        refreshKey.value += 1;
      } catch (err) {
        error.value = describeApiError(err, 'Could not delete the movie. Please try again.');
      }
    },
  });
}

const columns: DataTableColumns<Movie> = [
  { title: 'Title', key: 'title', render: (row) => h('span', { class: 'bx-td-data' }, row.title) },
  {
    title: 'Genres',
    key: 'genres',
    render: (row) => h('span', { class: 'bx-td-data text-bone-dim' }, row.genres.join(', ') || '—'),
  },
  {
    title: 'Duration',
    key: 'durationMinutes',
    render: (row) => h('span', { class: 'bx-td-data' }, `${row.durationMinutes} min`),
  },
  {
    title: 'Rating',
    key: 'ageRating',
    render: (row) => h('span', { class: 'bx-td-data' }, row.ageRating),
  },
  {
    title: 'Actions',
    key: 'actions',
    align: 'right',
    render: (row) =>
      h('div', { class: 'flex flex-wrap justify-end gap-2' }, [
        h(
          NButton,
          { size: 'small', quaternary: true, onClick: () => startEdit(row) },
          { default: () => 'Edit' },
        ),
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
      <h2 class="bx-panel-title">{{ editing ? 'Edit movie' : 'Create movie' }}</h2>
    </div>
    <n-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-placement="top"
      class="bx-form-grid bx-panel-body"
      @submit.prevent="submit"
    >
      <n-form-item label="Title" path="title" data-testid="mv-title">
        <n-input v-model:value="form.title" data-testid="mv-title-input" />
      </n-form-item>
      <n-form-item label="Genres (comma separated)" path="genres" data-testid="mv-genres">
        <n-input v-model:value="form.genres" data-testid="mv-genres-input" />
      </n-form-item>
      <n-form-item label="Duration (min)" path="durationMinutes" data-testid="mv-duration">
        <n-input-number
          v-model:value="form.durationMinutes"
          :show-button="false"
          style="width: 100%"
          data-testid="mv-duration-input"
        />
      </n-form-item>
      <n-form-item label="Age rating" path="ageRating" data-testid="mv-rating">
        <n-select
          v-model:value="form.ageRating"
          :options="ageOptions"
          data-testid="mv-rating-select"
        />
      </n-form-item>
      <n-form-item label="Release date" path="releaseDate" data-testid="mv-release">
        <n-date-picker
          id="mv-release-input"
          v-model:formatted-value="form.releaseDate"
          type="date"
          value-format="yyyy-MM-dd"
          class="w-full"
          data-testid="mv-release-input"
        />
      </n-form-item>
      <n-form-item label="Poster URL" path="posterUrl" data-testid="mv-poster">
        <n-input
          v-model:value="form.posterUrl"
          placeholder="https://…"
          data-testid="mv-poster-input"
        />
      </n-form-item>
      <n-form-item class="bx-span-2" label="Synopsis" path="synopsis" data-testid="mv-synopsis">
        <n-input
          v-model:value="form.synopsis"
          type="textarea"
          :autosize="{ minRows: 2 }"
          data-testid="mv-synopsis-input"
        />
      </n-form-item>
      <div class="bx-span-2 flex flex-wrap gap-2">
        <n-button type="primary" :loading="saving" attr-type="submit" class="bx-ctl-btn">
          {{ saving ? 'Saving…' : editing ? 'Update' : 'Create' }}
        </n-button>
        <n-button v-if="editing" quaternary class="bx-ctl-btn" @click="cancelEdit">Cancel</n-button>
      </div>
      <p v-if="error" role="alert" class="bx-err bx-span-2">{{ error }}</p>
    </n-form>
  </div>

  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading…
  </div>

  <div v-else-if="movies.length === 0" class="bx-empty">
    <p class="bx-empty-title">No movies yet</p>
    <p class="bx-empty-copy">Create the first movie above — it will appear here.</p>
  </div>

  <div v-else class="bx-scroll">
    <n-data-table :columns="columns" :data="movies" :bordered="false" :single-line="false" />
  </div>
</template>
