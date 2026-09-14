<script setup lang="ts">
import { h, ref, watch } from 'vue';
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui';
import * as api from '@/shared/api';
import type { Theater } from '@/shared/api/types';

const formRef = ref<FormInst | null>(null);
const form = ref({ name: '', address: '', rows: 8, cols: 12 });

const rules: FormRules = {
  name: [{ required: true, max: 100, message: 'Name is required.', trigger: ['blur', 'input'] }],
  address: [
    { required: true, max: 300, message: 'Address is required.', trigger: ['blur', 'input'] },
  ],
  rows: [
    {
      required: true,
      type: 'number',
      min: 1,
      max: 26,
      message: 'Enter 1–26 rows.',
      trigger: ['blur', 'change'],
    },
  ],
  cols: [
    {
      required: true,
      type: 'number',
      min: 1,
      max: 20,
      message: 'Enter 1–20 columns.',
      trigger: ['blur', 'change'],
    },
  ],
};

const saving = ref(false);
const error = ref<string | null>(null);
const refreshKey = ref(0);

const theaters = ref<Theater[]>([]);
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
    const page = await api.listTheaters({ limit: 100 });
    theaters.value = page.items;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load theaters.';
  } finally {
    loading.value = false;
  }
}

async function submit(): Promise<void> {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    await api.createTheater({
      name: form.value.name,
      address: form.value.address,
      layout: { rows: Number(form.value.rows), cols: Number(form.value.cols) },
    });
    form.value = { name: '', address: '', rows: 8, cols: 12 };
    refreshKey.value += 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Create failed';
  } finally {
    saving.value = false;
  }
}

const dialog = useDialog();

function remove(theater: Theater): void {
  dialog.warning({
    title: `Delete "${theater.name}"?`,
    content: 'This cannot be undone.',
    positiveText: 'Confirm',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.deleteTheater(theater.id);
        refreshKey.value += 1;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Delete failed';
      }
    },
  });
}

const columns: DataTableColumns<Theater> = [
  { title: 'Name', key: 'name', render: (row) => h('span', { class: 'bx-td-data' }, row.name) },
  {
    title: 'Address',
    key: 'address',
    render: (row) => h('span', { class: 'bx-td-data text-bone-dim' }, row.address),
  },
  {
    title: 'Seats',
    key: 'seats',
    render: (row) => h('span', { class: 'bx-td-data' }, String(row.seats.length)),
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
      <h2 class="bx-panel-title">Create theater</h2>
    </div>
    <n-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-placement="top"
      class="bx-form-grid bx-panel-body"
      @submit.prevent="submit"
    >
      <n-form-item label="Name" path="name" data-testid="th-name">
        <n-input v-model:value="form.name" data-testid="th-name-input" />
      </n-form-item>
      <n-form-item label="Address" path="address" data-testid="th-address">
        <n-input v-model:value="form.address" data-testid="th-address-input" />
      </n-form-item>
      <n-form-item label="Rows (A–Z)" path="rows" data-testid="th-rows">
        <n-input-number
          v-model:value="form.rows"
          :min="1"
          :max="26"
          :show-button="false"
          style="width: 100%"
          data-testid="th-rows-input"
        />
      </n-form-item>
      <n-form-item label="Columns" path="cols" data-testid="th-cols">
        <n-input-number
          v-model:value="form.cols"
          :min="1"
          :max="20"
          :show-button="false"
          style="width: 100%"
          data-testid="th-cols-input"
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

  <div v-else-if="theaters.length === 0" class="bx-empty">
    <p class="bx-empty-title">No theaters yet</p>
    <p class="bx-empty-copy">Create the first theater above — it will appear here.</p>
  </div>

  <div v-else class="bx-scroll">
    <n-data-table :columns="columns" :data="theaters" :bordered="false" :single-line="false" />
  </div>
</template>
