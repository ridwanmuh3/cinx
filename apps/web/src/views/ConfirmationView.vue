<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NButton } from 'naive-ui';
import * as api from '@/api';
import { formatDateTime, formatPrice } from '@/format';
import type { Booking, BookingSeatSnapshot } from '@/types';

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 3 * 60_000;

const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const booking = ref<Booking | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const polling = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollTicks = 0;

watch(
  id,
  () => {
    stopPolling();
    load();
  },
  { immediate: true },
);

/* While the booking is PENDING (paid on Xendit, webhook not yet arrived),
 * poll until it flips to CONFIRMED / a terminal state. */
watch(
  booking,
  (b) => {
    if (b?.status === 'PENDING') startPolling();
    else stopPolling();
  },
  { immediate: true },
);

onBeforeUnmount(stopPolling);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    booking.value = await api.getBooking(id.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load this booking.';
  } finally {
    loading.value = false;
  }
}

function startPolling(): void {
  if (pollTimer) return;
  polling.value = true;
  pollTicks = 0;
  const deadline = Date.now() + POLL_MAX_MS;
  pollTimer = setInterval(() => {
    void (async () => {
      if (Date.now() > deadline) {
        stopPolling();
        return;
      }
      try {
        // First poll is a plain refresh; afterwards actively sync payment
        // status with Xendit server-side, so confirmation lands even when
        // no webhook callback URL is registered. Falls back to a plain
        // refresh if the provider check fails.
        const fresh =
          pollTicks++ > 0 ? await api.syncPayment(id.value) : await api.getBooking(id.value);
        booking.value = fresh;
        if (fresh.status !== 'PENDING') stopPolling();
      } catch {
        /* keep polling; hard failures surface via manual refresh */
      }
    })();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  polling.value = false;
}

function seatLabel(seats: BookingSeatSnapshot[] | undefined, seatId: string): string {
  const seat = seats?.find((s) => s.seatId === seatId);
  return seat ? `(row ${seat.rowLabel} #${seat.seatNumber})` : '';
}
</script>

<template>
  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading booking…
  </div>

  <p v-else-if="error" role="alert" class="bx-err">{{ error }}</p>

  <template v-else-if="booking">
    <div v-if="booking.status === 'PENDING'" class="bx-empty">
      <p class="bx-empty-title">Payment processing</p>
      <p class="bx-empty-copy">
        Your Xendit payment is being confirmed. This page checks the payment status with Xendit
        automatically — tickets appear here once confirmed. No need to pay again.
      </p>
      <p v-if="polling" class="bx-dim" role="status">
        <span class="bx-loading-dot" aria-hidden="true"></span>
        Waiting for confirmation…
      </p>
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <n-button quaternary size="small" class="bx-ctl-btn" @click="load">Refresh now</n-button>
        <router-link to="/bookings" class="bx-btn bx-btn--ghost bx-btn--sm"
          >My Bookings</router-link
        >
      </div>
    </div>

    <div v-else-if="booking.status !== 'CONFIRMED'" class="bx-empty">
      <p class="bx-empty-title">Booking {{ booking.status }}</p>
      <p class="bx-empty-copy">
        This booking is {{ booking.status }}. You can view past bookings in My Bookings.
      </p>
      <router-link to="/bookings" class="bx-btn bx-btn--ghost bx-btn--sm">My Bookings</router-link>
    </div>

    <template v-else>
      <div class="bx-steps" aria-hidden="true">
        <span class="bx-step bx-step--done"><span class="bx-step-num">01</span> Select</span>
        <span class="bx-step bx-step--done"><span class="bx-step-num">02</span> Pay</span>
        <span class="bx-step bx-step--current"><span class="bx-step-num">03</span> Tickets</span>
      </div>

      <div class="bx-panel">
        <div class="bx-panel-head">
          <h1 class="bx-panel-title">Tickets issued</h1>
          <span class="bx-chip bx-chip--green">
            <span class="bx-chip-dot" aria-hidden="true"></span>
            Confirmed
          </span>
        </div>
        <div class="bx-panel-body">
          <p role="status" class="bx-ok mb-2">Payment received — your booking is confirmed.</p>

          <div class="mt-4">
            <div class="bx-summary-item">
              <span class="bx-summary-label">Movie</span>
              <span class="bx-summary-value">{{ booking.movie?.title }}</span>
            </div>
            <div class="bx-summary-item">
              <span class="bx-summary-label">Theater</span>
              <span class="bx-summary-value">{{ booking.theater?.name }}</span>
            </div>
            <div class="bx-summary-item">
              <span class="bx-summary-label">Starts at</span>
              <span class="bx-summary-value bx-data">
                {{ booking.startsAt ? formatDateTime(booking.startsAt) : '' }}
              </span>
            </div>
            <div class="bx-summary-item">
              <span class="bx-summary-label">Total paid</span>
              <span class="bx-summary-value bx-data">{{ formatPrice(booking.totalAmount) }}</span>
            </div>
          </div>

          <h2 class="bx-h2 mb-3 mt-6">Your tickets</h2>
          <div v-if="booking.tickets?.length" class="space-y-4">
            <div v-for="t in booking.tickets" :key="t.code" class="bx-stub">
              <p class="bx-stub-code">{{ t.code }}</p>
              <div class="bx-stub-meta">
                <span>{{ booking.movie?.title }}</span>
                <span>{{ booking.theater?.name }}</span>
                <span>{{ booking.startsAt ? formatDateTime(booking.startsAt) : '' }}</span>
                <span>Seat {{ t.seatId }} {{ seatLabel(booking.seats, t.seatId) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="bx-dim">No tickets found for this booking.</p>

          <p class="bx-label mt-6">Booking: {{ booking.id }}</p>
          <n-button quaternary class="mt-6" @click="$router.push('/movies')"
            >Back to cinema</n-button
          >
        </div>
      </div>
    </template>
  </template>
</template>
