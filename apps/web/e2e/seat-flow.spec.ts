import { test, expect } from './fixtures';
import { API_BASE, USER_STATE } from './helpers';

test.use({ storageState: USER_STATE });

test.describe('seat selection flow', () => {
  test('browse movie → choose cinema → select seats → hold', async ({ page, userApi }) => {
    // 1. Movie list → open first movie.
    await page.goto('/movies');
    const card = page.locator('a.bx-card[href^="/movies/"]').first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/movies\/[^/]+$/);

    // 2. Movie detail renders the "Choose cinema" dropdown and showtime cards.
    const cinemaFilter = page.locator('[data-testid="theater-filter"]');
    await expect(cinemaFilter).toBeVisible();
    await expect(cinemaFilter).toHaveText('All cinemas');
    const seatsLink = page.locator('a', { hasText: 'Select seats' }).first();
    await expect(seatsLink).toBeVisible();

    // 3. Filtering by cinema keeps at least the seeded theater's showtime.
    await cinemaFilter.click();
    const options = page.locator('.n-base-select-option');
    await expect(options).toHaveCount(2); // "All cinemas" + seeded theater
    await options.nth(1).click();
    await expect(page.locator('a', { hasText: 'Select seats' }).first()).toBeVisible();

    // 4. Open the seat picker.
    await page.locator('a', { hasText: 'Select seats' }).first().click();
    await expect(page).toHaveURL(/\/showtimes\/[^/]+\/seats$/);
    const showtimeId = page.url().match(/\/showtimes\/([^/]+)\/seats$/)?.[1];
    expect(showtimeId).toBeTruthy();

    // 5. Seat grid renders every seat; enabled seats match the live seat map.
    const seatMap = (await (
      await userApi.get(`${API_BASE}/showtimes/${showtimeId}/seats`)
    ).json()) as {
      price: { amount: number };
      seats: { id: string; isDisabled: boolean; status: string }[];
    };
    const allSeats = page.locator('button.bx-seat');
    await expect(allSeats).toHaveCount(seatMap.seats.length);

    // Seats held by earlier checkout tests render disabled too.
    const expectedEnabled = seatMap.seats.filter(
      (s) => !s.isDisabled && s.status === 'AVAILABLE',
    ).length;
    const enabledSeats = page.locator('button.bx-seat:not([disabled])');
    await expect(enabledSeats).toHaveCount(expectedEnabled);

    // 6. Selecting seats updates the counter and the total = seats × price.
    await enabledSeats.nth(0).click();
    await enabledSeats.nth(1).click();
    await expect(page.getByText(/Selected: 2 seat/)).toBeVisible();

    const totalLine = page.getByText(/Total:/);
    const totalDigits = Number(
      (await totalLine.textContent())?.split('Total:')[1]?.replace(/[^\d]/g, '') ?? '0',
    );
    expect(totalDigits).toBe(seatMap.price.amount * 2);

    // 7. Toggling a seat off and on updates the counter.
    await enabledSeats.nth(0).click();
    await expect(page.getByText(/Selected: 1 seat/)).toBeVisible();
    await enabledSeats.nth(0).click();
    await expect(page.getByText(/Selected: 2 seat/)).toBeVisible();

    // 8. Disabled seats cannot be selected (if any exist).
    const disabledSeats = page.locator('button.bx-seat[disabled]');
    if ((await disabledSeats.count()) > 0) {
      await disabledSeats.first().click({ force: true });
      await expect(page.getByText(/Selected: 2 seat/)).toBeVisible();
    }

    // 9. Hold seats → lands on checkout with a bookingId.
    await page.getByRole('button', { name: 'Hold seats' }).click();
    await expect(page).toHaveURL(/\/bookings\/checkout\?bookingId=/);
  });
});