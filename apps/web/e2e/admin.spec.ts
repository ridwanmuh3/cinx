import { test, expect } from './fixtures';
import { API_BASE, USER_STATE, ADMIN_STATE } from './helpers';

test.describe('admin guard', () => {
  test.use({ storageState: USER_STATE });

  test('non-admin is redirected away from /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/movies$/);
  });
});

test.describe('admin CRUD', () => {
  test.use({ storageState: ADMIN_STATE });

  test('movies: create, edit, delete', async ({ page }) => {
    await page.goto('/admin/movies');
    await expect(page.locator('h2').first()).toContainText('Create movie');

    const original = `E2E Movie ${Date.now()}`;
    const updated = `${original} (edited)`;

    // Create.
    await page.getByTestId('mv-title').locator('input').fill(original);
    await page.getByTestId('mv-genres').locator('input').fill('Action, Drama');
    await page.getByTestId('mv-duration').locator('input').fill('95');
    await page.getByTestId('mv-release').locator('input').fill('2027-01-15');
    await page.getByTestId('mv-synopsis').locator('textarea').fill('E2E test synopsis.');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tbody tr', { hasText: original })).toBeVisible();

    // Edit.
    const row = page.locator('tbody tr', { hasText: original });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h2').first()).toContainText('Edit movie');
    await page.getByTestId('mv-title').locator('input').fill(updated);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.locator('tbody tr', { hasText: updated })).toBeVisible();

    // Delete (Naive UI confirm dialog).
    await page
      .locator('tbody tr', { hasText: updated })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('tbody tr', { hasText: updated })).toHaveCount(0);
  });

  test('theaters: create, delete', async ({ page }) => {
    await page.goto('/admin/theaters');
    await expect(page.locator('h2').first()).toContainText('Create theater');

    const name = `E2E Theater ${Date.now()}`;
    await page.getByTestId('th-name').locator('input').fill(name);
    await page.getByTestId('th-address').locator('input').fill('E2E Street 1');
    await page.getByTestId('th-rows').locator('input').fill('4');
    await page.getByTestId('th-cols').locator('input').fill('6');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tbody tr', { hasText: name })).toBeVisible();

    await page
      .locator('tbody tr', { hasText: name })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);
  });

  test('showtimes: create, delete', async ({ page, adminApi }) => {
    await page.goto('/admin/showtimes');
    await expect(page.locator('h2').first()).toContainText('Create showtime');

    // Pick the first seeded movie + theater to associate with the showtime.
    const movies = await (await adminApi.get(`${API_BASE}/movies?limit=100`)).json();
    const theaters = await (await adminApi.get(`${API_BASE}/theaters?limit=100`)).json();
    const movieTitle = movies.items[0].title as string;
    const theaterName = theaters.items[0].name as string;

    await page.getByTestId('st-movie').locator('.n-select').click();
    await page.locator('.n-base-select-option', { hasText: movieTitle }).click();
    await page.getByTestId('st-theater').locator('.n-select').click();
    await page.locator('.n-base-select-option', { hasText: theaterName }).click();

    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60_000);
    // NDatePicker parses typed input against its display format: yyyy-MM-dd HH:mm:ss
    const iso = `${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 19)}`;
    await page.getByTestId('st-starts').locator('input').fill(iso);
    await page.getByTestId('st-price').locator('input').fill('75000');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.locator('tbody tr', { hasText: movieTitle })).toBeVisible();

    await page
      .locator('tbody tr', { hasText: movieTitle })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('tbody tr', { hasText: movieTitle })).toHaveCount(0);
  });
});
