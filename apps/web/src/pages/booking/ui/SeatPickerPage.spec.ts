import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import SeatPickerPage from './SeatPickerPage.vue';

const push = vi.fn();
const hold = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'show-1' } }),
  useRouter: () => ({ push }),
}));
vi.mock('@/shared/api', () => ({
  getShowtime: async () => ({
    movie: { title: 'Film' },
    theater: { name: 'Cinema' },
    startsAt: '2026-10-20T18:00:00Z',
  }),
  getSeatMap: async () => ({
    price: { amount: 50000 },
    seats: Array.from({ length: 9 }, (_, i) => ({
      id: `seat-${i + 1}`,
      row: 'A',
      number: i + 1,
      category: 'REGULAR',
      status: 'AVAILABLE',
      isDisabled: false,
      isAccessible: false,
    })),
  }),
  hold: (...args: unknown[]) => hold(...args),
}));

beforeEach(() => {
  push.mockReset();
  hold.mockReset();
});

it('limits selection to eight seats and sends those seats to checkout', async () => {
  hold.mockResolvedValue({ bookingId: 'booking-1' });
  const wrapper = mount(SeatPickerPage);
  await flushPromises();
  const seats = wrapper.findAll('button.bx-seat');
  expect(seats).toHaveLength(9);
  for (const seat of seats) await seat.trigger('click');
  expect(wrapper.text()).toContain('You can select up to 8 seats');
  expect(seats.filter((seat) => seat.attributes('aria-pressed') === 'true')).toHaveLength(8);

  await wrapper.find('.bx-summary-bar button').trigger('click');
  await flushPromises();
  expect(hold).toHaveBeenCalledWith({
    showtimeId: 'show-1',
    seatIds: Array.from({ length: 8 }, (_, i) => `seat-${i + 1}`),
  });
  expect(push).toHaveBeenCalledWith({
    path: '/bookings/checkout',
    query: { bookingId: 'booking-1' },
  });
  wrapper.unmount();
});
