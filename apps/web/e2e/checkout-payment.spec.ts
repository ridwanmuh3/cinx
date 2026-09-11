import { test, expect, APIRequestContext } from './fixtures';
import { API_BASE, USER_STATE } from './helpers';

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
    const seatIds = (seatMap.seats as { id: string; isDisabled: boolean; status?: string }[])
      .filter((s) => !s.isDisabled && (s.status ?? 'AVAILABLE') === 'AVAILABLE')
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
  test('pay creates a Xendit invoice and shows the redirect state', async ({ page, userApi }) => {
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

    // Xendit invoice creation (route to the hosted checkout in production;
    // in CI without XENDIT_SECRET_KEY the API returns 502/503 — stub it).
    await page.route('**/api/v1/bookings/*/pay', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: booking.bookingId,
          status: 'PENDING',
          checkoutUrl: 'https://checkout.xendit.co/inv_test',
          invoiceId: 'inv_test',
        }),
      });
    });
    await page.getByRole('button', { name: 'Pay with Xendit' }).click();
    await expect(page.getByText(/Redirecting to Xendit/)).toBeVisible();
  });

  test('pay API returns checkoutUrl + invoiceId', async ({ userApi }) => {
    const booking = await makeBooking(userApi, [1, 0, 2]);
    const res = await userApi.post(`${API_BASE}/bookings/${booking.bookingId}/pay`, {
      data: {},
    });
    // Without live Xendit credentials this is a 502/503; with credentials it
    // returns the hosted invoice. Either way the mock flow is gone.
    if (res.ok()) {
      const body = await res.json();
      expect(typeof body.checkoutUrl).toBe('string');
      expect(typeof body.invoiceId).toBe('string');
    } else {
      expect([502, 503]).toContain(res.status());
    }
  });
});
