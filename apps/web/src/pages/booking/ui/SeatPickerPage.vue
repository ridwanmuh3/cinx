<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton } from 'naive-ui';
import * as api from '@/shared/api';
import { formatDateTime, formatPrice } from '@/shared/lib/format';
import { describeApiError } from '@/shared/lib/api-errors';
import { seatConflictFromError } from '@/features/booking';
import type { SeatAvailability, SeatMap, Showtime } from '@/shared/api/types';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ''));

const showtime = ref<Showtime | null>(null);
const seatMap = ref<SeatMap | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const selected = ref<Set<string>>(new Set());
const holding = ref(false);
const holdError = ref<string | null>(null);
/** Seat ids the server just reported as taken by someone else. */
const conflictIds = ref<Set<string>>(new Set());

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
  showtime.value = null;
  seatMap.value = null;
  selected.value = new Set();
  conflictIds.value = new Set();
  holdError.value = null;
  try {
    const [s, map] = await Promise.all([api.getShowtime(id.value), api.getSeatMap(id.value)]);
    showtime.value = s;
    seatMap.value = map;
  } catch (err) {
    error.value = describeApiError(err, 'Could not load the seat map.');
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

/** Labels of the seats currently picked, e.g. "B7, B8" — shown in the action bar. */
const selectedLabels = computed(() => {
  const map = seatMap.value;
  if (!map) return '';
  return map.seats
    .filter((s) => selected.value.has(s.id))
    .sort((a, b) => (a.row === b.row ? a.number - b.number : a.row.localeCompare(b.row)))
    .map((s) => `${s.row}${s.number}`)
    .join(', ');
});

function isPicked(seatId: string): boolean {
  return selected.value.has(seatId);
}

/** A seat is only blocked when explicitly occupied/held or disabled; a
 *  missing status means AVAILABLE. */
function isUnavailable(seat: SeatAvailability): boolean {
  return seat.isDisabled || seat.status === 'HELD' || seat.status === 'BOOKED';
}

function seatClass(seat: SeatAvailability): string {
  const cls: string[] = [];
  if (isPicked(seat.id)) {
    cls.push('bx-seat--selected');
  } else if (conflictIds.value.has(seat.id)) {
    cls.push('bx-seat--conflict');
  } else if (seat.isDisabled) {
    cls.push('bx-seat--disabled');
  } else if (seat.status === 'BOOKED') {
    cls.push('bx-seat--booked');
  } else if (seat.status === 'HELD') {
    cls.push('bx-seat--held');
  }
  if (!isPicked(seat.id) && seat.status === 'AVAILABLE') {
    if (seat.category === 'VIP') cls.push('bx-seat--vip');
    if (seat.category === 'COUPLE') cls.push('bx-seat--couple');
    if (seat.isAccessible) cls.push('bx-seat--accessible');
  }
  return cls.join(' ');
}

function seatAria(seat: SeatAvailability): string {
  const category = seat.category.toLowerCase();
  const accessible = seat.isAccessible ? ', accessible' : '';
  const conflict = conflictIds.value.has(seat.id) ? ', just taken' : '';
  const status = seat.isDisabled
    ? 'unavailable'
    : isPicked(seat.id)
      ? 'selected'
      : seat.status.toLowerCase();
  return `Row ${seat.row}, seat ${seat.number}, ${category}${accessible}${conflict}, ${status}`;
}

function toggle(seat: SeatAvailability): void {
  if (isUnavailable(seat)) return;
  const next = new Set(selected.value);
  if (!next.delete(seat.id)) {
    if (next.size >= 8) {
      holdError.value = 'You can select up to 8 seats. Remove one to choose another.';
      return;
    }
    next.add(seat.id);
  }
  selected.value = next;
  holdError.value = null;
}

/** Pulls the latest map, keeping the just-taken seats highlighted until the
 *  user makes their next move. Selection is cleared — those plans are dead. */
async function refreshAfterConflict(conflict: {
  conflictSeatIds: Set<string>;
  message: string;
}): Promise<void> {
  selected.value = new Set();
  try {
    const map = await api.getSeatMap(id.value);
    seatMap.value = map;
  } catch {
    // Even a failed refresh must not hide the truth about the lost seats.
  }
  conflictIds.value = conflict.conflictSeatIds;
  holdError.value = conflict.message;
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
  conflictIds.value = new Set();
  try {
    const res = await api.hold({ showtimeId: id.value, seatIds: ids });
    await router.push({ path: '/bookings/checkout', query: { bookingId: res.bookingId } });
  } catch (err) {
    const conflict = seatConflictFromError(err, seatMap.value);
    if (conflict) {
      await refreshAfterConflict({
        conflictSeatIds: new Set(conflict.conflictSeatIds),
        message: conflict.message,
      });
    } else {
      holdError.value = describeApiError(err, 'Could not hold those seats. Please try again.');
    }
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

  <div v-else-if="error" role="alert" class="bx-alert bx-alert--error">
    <span class="bx-alert-icon" aria-hidden="true">!</span>
    <span>{{ error }}</span>
    <button type="button" class="bx-btn bx-btn--sm" @click="load">Retry</button>
  </div>

  <template v-else-if="seatMap && showtime">
    <nav class="bx-steps" aria-label="Booking progress">
      <span class="bx-step bx-step--current" aria-current="step"
        ><span class="bx-step-num">01</span> Select</span
      >
      <span class="bx-step"><span class="bx-step-num">02</span> Pay</span>
      <span class="bx-step"><span class="bx-step-num">03</span> Tickets</span>
    </nav>

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

        <p id="seat-map-help" class="bx-dim mt-5">
          Swipe sideways to see all seats. Tap a seat to select it.
        </p>
        <div
          class="bx-seatmap mt-3"
          role="region"
          aria-label="Seat map, scroll horizontally"
          tabindex="0"
        >
          <div class="bx-screen-arc">Screen</div>
          <div
            class="bx-seat-grid"
            role="group"
            aria-label="Choose seats"
            aria-describedby="seat-map-help"
          >
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
        <p class="bx-dim mt-4 text-center">Choose up to 8 seats per booking.</p>

        <div v-if="holdError" role="alert" class="bx-alert bx-alert--error mt-4">
          <span class="bx-alert-icon" aria-hidden="true">!</span>
          <span>{{ holdError }}</span>
        </div>
        <div class="bx-summary-bar">
          <span class="bx-data text-sm text-bone-dim">
            <template v-if="selectedCount > 0 && selectedLabels">
              Selected: {{ selectedCount }} seat(s) · {{ selectedLabels }} ·
            </template>
            <template v-else>Selected: {{ selectedCount }} seat(s) ·</template>
            Total: {{ formatPrice(total) }}
          </span>
          <n-button type="primary" :loading="holding" :disabled="selectedCount === 0" @click="hold">
            {{ holding ? 'Holding…' : 'Hold seats' }}
          </n-button>
        </div>
      </div>
    </div>
  </template>
</template>
