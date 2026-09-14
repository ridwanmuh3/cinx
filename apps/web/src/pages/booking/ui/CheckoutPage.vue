<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton } from 'naive-ui';
import * as api from '@/shared/api';
import { formatDateTime, formatPrice } from '@/shared/lib/format';
import { useCountdown } from '@/features/booking';
import type { Booking } from '@/shared/api/types';

const route = useRoute();
const router = useRouter();
const bookingId = computed(() => {
  const q = route.query.bookingId;
  return typeof q === 'string' ? q : '';
});

const booking = ref<Booking | null>(null);
const loading = ref(true);
const paying = ref(false);
const checkoutUrl = ref<string | null>(null);
const error = ref<string | null>(null);

/* ---- hold countdown: ticks against the booking's expiresAt ---- */
const holdExpiresAt = computed(() => booking.value?.expiresAt ?? null);
const { countdownText, expired, warning } = useCountdown(holdExpiresAt);

watch(
  bookingId,
  () => {
    load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    booking.value = await api.getBooking(bookingId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load this booking.';
  } finally {
    loading.value = false;
  }
}

const isPending = computed(() => booking.value?.status === 'PENDING');

async function pay(): Promise<void> {
  const id = bookingId.value;
  if (!id) return;
  paying.value = true;
  error.value = null;
  try {
    const returnUrl = `${window.location.origin}/bookings/confirm/${id}`;
    const res = await api.pay(id, returnUrl);
    booking.value = res;
    if (res.checkoutUrl) {
      checkoutUrl.value = res.checkoutUrl;
      window.location.href = res.checkoutUrl;
    } else {
      error.value = 'No checkout URL returned. Please try again.';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Payment failed';
  } finally {
    paying.value = false;
  }
}

function goConfirm(id: string): void {
  router.push(`/bookings/confirm/${id}`);
}
</script>

<template>
  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading booking…
  </div>

  <template v-else-if="booking">
    <div class="bx-steps" aria-hidden="true">
      <span class="bx-step bx-step--done"><span class="bx-step-num">01</span> Select</span>
      <span class="bx-step bx-step--current"><span class="bx-step-num">02</span> Pay</span>
      <span class="bx-step"><span class="bx-step-num">03</span> Tickets</span>
    </div>

    <div class="bx-panel">
      <div class="bx-panel-head">
        <h1 class="bx-panel-title">{{ booking.movie?.title }}</h1>
        <span class="bx-chip bx-chip--amber">
          <span class="bx-chip-dot bx-chip-dot--pulse" aria-hidden="true"></span>
          Hold live
        </span>
      </div>
      <div class="bx-panel-body">
        <p class="bx-dim mb-4">
          {{ booking.theater?.name }} ·
          {{ booking.startsAt ? formatDateTime(booking.startsAt) : '' }}
        </p>

        <div class="bx-hold">
          <span class="bx-hold-label">Hold expires in</span>
          <span
            role="timer"
            class="bx-count"
            :class="{ 'bx-count--expired': expired, 'bx-count--warn': warning }"
            >{{ countdownText }}</span
          >
        </div>

        <div v-for="seat in booking.seats" :key="seat.seatId" class="bx-summary-item">
          <span class="bx-summary-label">Seat {{ seat.rowLabel }}{{ seat.seatNumber }}</span>
          <span class="bx-summary-value bx-data">{{ seat.category }}</span>
        </div>
        <div class="bx-summary-item">
          <span class="bx-summary-label">Total</span>
          <span class="bx-summary-value bx-data text-[19px] text-amber">{{
            formatPrice(booking.totalAmount)
          }}</span>
        </div>

        <template v-if="booking.status === 'CONFIRMED'">
          <p role="status" class="bx-ok mt-5">Payment successful — booking confirmed.</p>
          <n-button type="primary" class="mt-4" @click="goConfirm(booking.id)"
            >View tickets</n-button
          >
        </template>

        <template v-else-if="!isPending">
          <p role="alert" class="bx-err mt-5">
            This booking is {{ booking.status }} and can no longer be paid. Pick your seats again.
          </p>
          <router-link to="/movies" class="bx-btn bx-btn--ghost mt-4">Back to cinema</router-link>
        </template>

        <template v-else-if="expired">
          <p role="alert" class="bx-err mt-5">
            Your hold expired and the seats were released. Pick your seats again.
          </p>
          <router-link to="/movies" class="bx-btn bx-btn--ghost mt-4">Back to cinema</router-link>
        </template>

        <template v-else-if="checkoutUrl">
          <p role="status" class="bx-ok mt-5">
            Redirecting to Xendit secure checkout… If you are not redirected,
            <a :href="checkoutUrl" class="underline">continue to payment</a>.
          </p>
          <n-button type="primary" class="mt-4" @click="goConfirm(booking.id)"
            >Check booking status</n-button
          >
        </template>

        <template v-else>
          <p class="bx-dim mt-5">
            You will be redirected to Xendit to complete payment. Your seats stay held until the
            timer ends.
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <n-button type="primary" :loading="paying" @click="pay()">
              {{ paying ? 'Creating invoice…' : 'Pay with Xendit' }}
            </n-button>
          </div>
        </template>

        <p v-if="error" role="alert" class="bx-err mt-4">{{ error }}</p>
      </div>
    </div>
  </template>
</template>
