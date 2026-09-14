<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton } from 'naive-ui';
import * as api from '@/shared/api';
import { formatDateTime, formatPrice } from '@/shared/lib/format';
import { useCountdown } from '@/features/booking';
import type { SeatAvailability, SeatMap, Showtime } from '@/shared/api/types';

interface HeldSeatInfo {
  seatId: string;
  row: string;
  seatNumber: number;
  priceAmount: number;
  priceCurrency: 'IDR';
}

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ''));

const showtime = ref<Showtime | null>(null);
const seatMap = ref<SeatMap | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const selected = ref<Set<string>>(new Set());
const held = ref<{ bookingId: string; expiresAt: string; seats: HeldSeatInfo[] } | null>(null);
const holding = ref(false);
const holdError = ref<string | null>(null);

/* ---- hold countdown (5-minute TTL from the API) ---- */
const holdExpiresAt = ref<string | null>(null);
const { countdownText, expired, warning, start: startCountdown } = useCountdown(holdExpiresAt);

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
  try {
    const [s, map] = await Promise.all([api.getShowtime(id.value), api.getSeatMap(id.value)]);
    showtime.value = s;
    seatMap.value = map;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load the seat map.';
  } finally {
    loading.value = false;
  }
}

const grouped = computed(() => {
  const map = seatMap.value;
  if (!map) return [];
  const rows = new Map<string, SeatAvailability[]>();
  map.seats.forEach((seat) => {
    const arr = rows.get(seat.row) ?? [];
    arr.push(seat);
    rows.set(seat.row, arr);
  });
  const out: { row: string; seats: SeatAvailability[] }[] = [];
  for (const [row, seats] of rows) {
    out.push({ row, seats: [...seats].sort((a, b) => a.number - b.number) });
  }
  return out.sort((a, b) => a.row.localeCompare(b.row));
});

const selectedCount = computed(() => selected.value.size);

const total = computed(() => {
  const map = seatMap.value;
  const price = map?.price?.amount;
  if (!map || price == null) return 0;
  let sum = 0;
  map.seats.forEach((s) => {
    if (selected.value.has(s.id)) sum += price;
  });
  return sum;
});

function isPicked(id: string): boolean {
  return selected.value.has(id);
}

/** A seat is only blocked when explicitly occupied/held or disabled; a
 *  missing status means AVAILABLE. */
function isUnavailable(seat: SeatAvailability): boolean {
  return seat.isDisabled || seat.status === 'HELD' || seat.status === 'BOOKED';
}

function seatClass(seat: SeatAvailability): string {
  const cls: string[] = [];
  if (seat.isDisabled) {
    cls.push('bx-seat--disabled');
  } else if (seat.status === 'BOOKED') {
    cls.push('bx-seat--booked');
  } else if (seat.status === 'HELD') {
    cls.push('bx-seat--held');
  } else if (isPicked(seat.id)) {
    cls.push('bx-seat--selected');
  }
  if (seat.category === 'VIP' && !isPicked(seat.id) && seat.status === 'AVAILABLE') {
    cls.push('bx-seat--vip');
  }
  if (seat.category === 'COUPLE' && !isPicked(seat.id) && seat.status === 'AVAILABLE') {
    cls.push('bx-seat--couple');
  }
  if (seat.isAccessible && !isPicked(seat.id) && seat.status === 'AVAILABLE') {
    cls.push('bx-seat--accessible');
  }
  return cls.join(' ');
}

function seatAria(seat: SeatAvailability): string {
  const category = seat.category.toLowerCase();
  const accessible = seat.isAccessible ? ', accessible' : '';
  const status = seat.isDisabled
    ? 'unavailable'
    : isPicked(seat.id)
      ? 'selected'
      : seat.status.toLowerCase();
  return `Row ${seat.row}, seat ${seat.number}, ${category}${accessible}, ${status}`;
}

function toggle(seat: SeatAvailability): void {
  if (isUnavailable(seat)) return;
  const next = new Set(selected.value);
  if (!next.delete(seat.id)) next.add(seat.id);
  selected.value = next;
}

async function hold(): Promise<void> {
  if (selected.value.size === 0) return;
  if (selected.value.size > 8) {
    holdError.value = 'You can hold at most 8 seats at once.';
    return;
  }
  const ids = [...selected.value];
  holding.value = true;
  holdError.value = null;
  try {
    const res = await api.hold({ showtimeId: id.value, seatIds: ids });
    held.value = {
      bookingId: res.bookingId,
      expiresAt: res.expiresAt,
      seats: res.seats.map((s) => ({
        seatId: s.seatId,
        row: s.rowLabel,
        seatNumber: s.seatNumber,
        priceAmount: s.priceAmount,
        priceCurrency: 'IDR',
      })),
    };
    holdExpiresAt.value = res.expiresAt;
    startCountdown();
    router.push({ path: '/bookings/checkout', query: { bookingId: res.bookingId } });
  } catch (err) {
    holdError.value = err instanceof Error ? err.message : 'Could not hold seats';
  } finally {
    holding.value = false;
  }
}
</script>

<template>
  <div v-if="loading" class="bx-loading">
    <span class="bx-loading-dot" aria-hidden="true"></span>
    Loading seat map…
  </div>

  <p v-else-if="error" role="alert" class="bx-err">{{ error }}</p>

  <template v-else-if="seatMap && showtime">
    <div class="bx-steps" aria-hidden="true">
      <span class="bx-step bx-step--current"><span class="bx-step-num">01</span> Select</span>
      <span class="bx-step"><span class="bx-step-num">02</span> Pay</span>
      <span class="bx-step"><span class="bx-step-num">03</span> Tickets</span>
    </div>

    <div class="bx-panel">
      <div class="bx-panel-head">
        <h1 class="bx-panel-title">{{ showtime.movie.title }}</h1>
        <span class="bx-chip bx-chip--amber">
          <span class="bx-chip-dot bx-chip-dot--pulse" aria-hidden="true"></span>
          Live
        </span>
      </div>
      <div class="bx-panel-body">
        <p class="bx-dim mb-4">
          {{ showtime.theater.name }} · {{ formatDateTime(showtime.startsAt) }} · Price per seat:
          <template v-if="seatMap.price?.amount != null">{{
            formatPrice(seatMap.price.amount)
          }}</template>
          <template v-else>—</template>
        </p>

        <div v-if="held" class="bx-hold">
          <span class="bx-hold-label">Seats held for you</span>
          <span
            role="timer"
            class="bx-count"
            :class="{ 'bx-count--expired': expired, 'bx-count--warn': warning }"
            >{{ countdownText }}</span
          >
        </div>

        <div class="bx-seatmap mt-5">
          <div class="bx-screen-arc">Screen</div>
          <div class="bx-seat-grid">
            <div v-for="entry in grouped" :key="entry.row" class="bx-seat-row">
              <span class="bx-seat-row-label">{{ entry.row }}</span>
              <button
                v-for="seat in entry.seats"
                :key="seat.id"
                type="button"
                class="bx-seat"
                :class="seatClass(seat)"
                :disabled="isUnavailable(seat)"
                :aria-pressed="isUnavailable(seat) ? false : isPicked(seat.id)"
                :aria-label="seatAria(seat)"
                @click="toggle(seat)"
              >
                {{ seat.number }}
              </button>
            </div>
            <p v-if="grouped.length === 0" class="bx-dim">No seats available for this showtime.</p>
          </div>
          <div class="bx-legend">
            <span class="bx-legend-item"
              ><span class="bx-swatch bx-swatch--available"></span>Available</span
            >
            <span class="bx-legend-item"
              ><span class="bx-swatch bx-swatch--selected"></span>Selected</span
            >
            <span class="bx-legend-item"><span class="bx-swatch bx-swatch--held"></span>Held</span>
            <span class="bx-legend-item"
              ><span class="bx-swatch bx-swatch--booked"></span>Booked</span
            >
            <span class="bx-legend-item"><span class="bx-swatch bx-swatch--vip"></span>VIP</span>
            <span class="bx-legend-item"
              ><span class="bx-swatch bx-swatch--couple"></span>Couple</span
            >
            <span class="bx-legend-item"
              ><span class="bx-swatch bx-swatch--accessible"></span>Accessible</span
            >
            <span class="bx-legend-item"
              ><span class="bx-swatch bx-swatch--disabled"></span>Unavailable</span
            >
          </div>
        </div>

        <div class="bx-hold mt-5">
          <span class="bx-data text-sm text-bone-dim">
            Selected: {{ selectedCount }} seat(s) · Total: {{ formatPrice(total) }}
          </span>
          <n-button type="primary" :loading="holding" :disabled="selectedCount === 0" @click="hold">
            {{ holding ? 'Holding…' : 'Hold seats' }}
          </n-button>
        </div>

        <p v-if="holdError" role="alert" class="bx-err mt-4">{{ holdError }}</p>
      </div>
    </div>
  </template>
</template>
