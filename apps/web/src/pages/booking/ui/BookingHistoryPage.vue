<script setup lang="ts">
import { ref, watch } from 'vue';
import { NButton, useDialog } from 'naive-ui';
import * as api from '@/shared/api';
import { formatDateTime, formatPrice } from '@/shared/lib/format';
import { describeApiError } from '@/shared/lib/api-errors';
import { PendingCountdown, statusChipClass, statusLabel } from '@/features/booking';
import type { Booking } from '@/shared/api/types';

const bookings = ref<Booking[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
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
    error.value = describeApiError(err, 'Could not load your bookings.');
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  refreshKey.value += 1;
}

const dialog = useDialog();

/** Irreversible, so it gets the same confirmation courtesy as admin deletes. */
function cancel(booking: Booking): void {
  dialog.warning({
    title: `Cancel booking for “${booking.movie?.title ?? 'this showtime'}”?`,
    content:
      'The seats will be released immediately and someone else can take them. This cannot be undone.',
    positiveText: 'Cancel booking',
    negativeText: 'Keep it',
    onPositiveClick: async () => {
      try {
        await api.cancelBooking(booking.id);
        notice.value = 'Booking cancelled — the seats have been released.';
        reload();
      } catch (err) {
        error.value = describeApiError(err, 'Could not cancel this booking. Please try again.');
      }
    },
  });
}

/** A row's hold ran out while the list was open — re-sync server truth
 *  (the booking flips to EXPIRED) after a beat. */
function markExpired(): void {
  window.setTimeout(reload, 1500);
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
    <div role="alert" class="bx-alert bx-alert--error">
      <span class="bx-alert-icon" aria-hidden="true">!</span>
      <span>{{ error }}</span>
    </div>
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
    <div v-if="notice" role="status" class="bx-alert bx-alert--success mb-4">
      <span class="bx-alert-icon" aria-hidden="true">✓</span>
      <span>{{ notice }}</span>
    </div>

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
          <PendingCountdown
            v-if="b.status === 'PENDING'"
            :expires-at="b.expiresAt"
            @expired="markExpired"
          />
          <span v-else class="bx-chip" :class="statusChipClass(b.status)">{{
            statusLabel(b.status)
          }}</span>
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

  <div v-if="error && bookings.length > 0" role="alert" class="bx-alert bx-alert--error mt-4">
    <span class="bx-alert-icon" aria-hidden="true">!</span>
    <span>{{ error }}</span>
  </div>
</template>
