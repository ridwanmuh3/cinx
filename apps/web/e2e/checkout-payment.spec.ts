import { test, expect, APIRequestContext } from './fixtures';
import { API_BASE, USER_STATE, ADMIN_STATE } from './helpers';

test.use({ storageState: USER_STATE });

interface HeldBooking {
  bookingId: string;
  movieTitle: string;
  theaterName: string;
  seatCount: number;
  totalAmount: number;
}

async function makeBooking(
  api: APIRequestContext,
  showtimeIndexes: number[],
): Promise<HeldBooking> {
  const showtimes = await (await api.get(`${API_BASE}/showtimes?limit=100`)).json();
  for (const showtimeIndex of showtimeIndexes) {
    const showtime = showtimes.items[showtimeIndex] as {
      id: string;
      movie: { title: string };
      theater: { name: string };
      price: { amount: number };
    };
    const seatMap = await (await api.get(`${API_BASE}/showtimes/${showtime.id}/seats`)).json();
    const seatIds = (seatMap.seats as { id: string; isDisabled: boolean }[])
      .filter((s) => !s.isDisabled)
      .slice(0, 2)
      .map((s) => s.id);
    if (seatIds.length !== 2) {
      continue;
    }
    const holdRes = await api.post(`${API_BASE}/bookings/holds`, {
      data: { showtimeId: showtime.id, seatIds },
    });
    if (!holdRes.ok()) {
      continue;
    }
    const hold = await holdRes.json();
    return {
      bookingId: hold.bookingId,
      movieTitle: showtime.movie.title,
      theaterName: showtime.theater.name,
      seatCount: seatIds.length,
      totalAmount: showtime.price.amount * seatIds.length,
    };
  }
  throw new Error('no showtime could be held');
}

test.describe('checkout & payment', () => {
  test('pay success → view tickets → booking history shows confirmed', async ({
    page,
    userApi,
  }) => {
    const booking = await makeBooking(userApi, [2, 1, 0]);
    await page.goto(`/bookings/checkout?bookingId=${booking.bookingId}`);

    // Summary renders the held booking.
    await expect(page.locator('h1')).toHaveText(booking.movieTitle);
    await expect(page.getByText(booking.theaterName)).toBeVisible();
    const seatRows = page.locator('.bx-summary-label', { hasText: 'Seat ' });
    await expect(seatRows).toHaveCount(booking.seatCount);
    const totalValue = page
      .locator('.bx-summary-item', { hasText: 'Total' })
      .locator('.bx-summary-value');
    const totalDigits = Number((await totalValue.textContent())?.replace(/[^\d]/g, '') ?? '0');
    expect(totalDigits).toBe(booking.totalAmount);

    // Success path.
    await page.getByRole('button', { name: 'Pay now (success)' }).click();
    await expect(page.getByText('Payment successful — booking confirmed.')).toBeVisible();

    // Confirmation page with tickets.
    await page.getByRole('button', { name: 'View tickets' }).click();
    await expect(page).toHaveURL(/\/bookings\/confirm\/[^/]+$/);
    await expect(page.getByText('Tickets issued')).toBeVisible();
    await expect(page.locator('.bx-stub-code').first()).toContainText('TKT-');
    await expect(page.getByText(booking.movieTitle).first()).toBeVisible();

    // Booking history lists the confirmed booking.
    await page.goto('/bookings');
    await expect(page.locator('tr, div', { hasText: booking.movieTitle }).first()).toBeVisible();
    await expect(
      page
        .locator('tr, div', { hasText: booking.movieTitle })
        .first()
        .getByText('Confirmed', { exact: true }),
    ).toBeVisible();
  });

  test('payment failure shows error and retry returns to idle', async ({ page, userApi }) => {
    const booking = await makeBooking(userApi, [1, 0, 2]);
    await page.goto(`/bookings/checkout?bookingId=${booking.bookingId}`);
    await expect(page.locator('h1')).toHaveText(booking.movieTitle);

    // Failure path.
    await page.getByRole('button', { name: 'Simulate failure' }).click();
    await expect(page.getByText(/Payment failed/)).toBeVisible();

    // Retry returns to the idle payment buttons.
    await page.getByRole('button', { name: 'Retry payment' }).click();
    await expect(page.getByRole('button', { name: 'Pay now (success)' })).toBeVisible();
  });
});
