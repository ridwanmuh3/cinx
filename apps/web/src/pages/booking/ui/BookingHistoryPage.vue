<script setup lang="ts">
import { ref, watch } from 'vue';
import { NButton } from 'naive-ui';
import * as api from '@/shared/api';
import { formatDateTime, formatPrice } from '@/shared/lib/format';
import { statusChipClass, statusLabel } from '@/features/booking';
import type { Booking } from '@/shared/api/types';

const bookings = ref<Booking[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const refreshKey = ref(0);

watch(
  refreshKey,
  () => {
    load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const page = await api.listBookings({ limit: 20 });
    bookings.value = page.items;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load your bookings.';
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  refreshKey.value += 1;
}

async function cancel(booking: Booking): Promise<void> {
  try {
    await api.cancelBooking(booking.id);
    reload();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Cancel failed';
  }
}
</script>

<template>
  <div class="bx-page-head">
    <h1 class="bx-h1">My bookings</h1>
    <n-button quaternary size="small" class="bx-ctl-btn" @click="reload">Refresh</n-button>
  </div>

  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading…
  </div>

  <template v-else-if="error && bookings.length === 0">
    <p role="alert" class="bx-err">{{ error }}</p>
  </template>

  <template v-else-if="bookings.length === 0">
    <div class="bx-empty">
      <p class="bx-empty-title">No bookings yet</p>
      <p class="bx-empty-copy">
        Browse now-showing movies and pick your seats — they'll be held for you while you pay.
      </p>
      <router-link to="/movies" class="bx-btn bx-btn--primary bx-btn--sm"
        >Browse movies</router-link
      >
    </div>
  </template>

  <template v-else>
    <div class="bx-panel">
      <div v-for="b in bookings" :key="b.id" class="bx-row">
        <div>
          <p class="bx-row-title">{{ b.movie?.title }}</p>
          <p class="bx-row-meta">
            {{ b.startsAt ? formatDateTime(b.startsAt) : '' }} · {{ b.theater?.name }} ·
            {{ b.seats.length }} seat(s) · {{ formatPrice(b.totalAmount) }}
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <span class="bx-chip" :class="statusChipClass(b.status)">{{ statusLabel(b.status) }}</span>
          <div class="bx-row-actions">
            <template v-if="b.status === 'PENDING'">
              <router-link
                :to="{ path: '/bookings/checkout', query: { bookingId: b.id } }"
                class="bx-btn bx-btn--primary bx-btn--sm"
                >Pay</router-link
              >
              <n-button size="small" quaternary class="bx-ctl-btn" @click="cancel(b)"
                >Cancel</n-button
              >
            </template>
            <template v-else-if="b.status === 'CONFIRMED'">
              <router-link
                :to="`/bookings/confirm/${b.id}`"
                class="bx-btn bx-btn--ghost bx-btn--sm"
              >
                View tickets
              </router-link>
            </template>
          </div>
        </div>
      </div>
    </div>
  </template>

  <p v-if="error && bookings.length > 0" role="alert" class="bx-err mt-4">{{ error }}</p>
</template>
