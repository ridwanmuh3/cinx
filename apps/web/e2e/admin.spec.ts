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
    await page.locator('input[formControlName="title"]').fill(original);
    await page.locator('input[formControlName="genres"]').fill('Action, Drama');
    await page.locator('input[formControlName="durationMinutes"]').fill('95');
    await page.locator('input[formControlName="releaseDate"]').fill('2027-01-15');
    await page.locator('textarea[formControlName="synopsis"]').fill('E2E test synopsis.');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tbody tr', { hasText: original })).toBeVisible();

    // Edit.
    const row = page.locator('tbody tr', { hasText: original });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h2').first()).toContainText('Edit movie');
    await page.locator('input[formControlName="title"]').fill(updated);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.locator('tbody tr', { hasText: updated })).toBeVisible();

    // Delete.
    page.once('dialog', (d) => d.accept());
    await page
      .locator('tbody tr', { hasText: updated })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.locator('tbody tr', { hasText: updated })).toHaveCount(0);
  });

  test('theaters: create, delete', async ({ page }) => {
    await page.goto('/admin/theaters');
    await expect(page.locator('h2').first()).toContainText('Create theater');

    const name = `E2E Theater ${Date.now()}`;
    await page.locator('input[formControlName="name"]').fill(name);
    await page.locator('input[formControlName="address"]').fill('E2E Street 1');
    await page.locator('input[formControlName="rows"]').fill('4');
    await page.locator('input[formControlName="cols"]').fill('6');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tbody tr', { hasText: name })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page
      .locator('tbody tr', { hasText: name })
      .getByRole('button', { name: 'Delete' })
      .click();
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

    await page.locator('select[formControlName="movieId"]').selectOption({ label: movieTitle });
    await page.locator('select[formControlName="theaterId"]').selectOption({ label: theaterName });

    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60_000);
    const iso = local.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm for datetime-local
    await page.locator('input[formControlName="startsAt"]').fill(iso);
    await page.locator('input[formControlName="priceAmount"]').fill('75000');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.locator('tbody tr', { hasText: movieTitle })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page
      .locator('tbody tr', { hasText: movieTitle })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.locator('tbody tr', { hasText: movieTitle })).toHaveCount(0);
  });
});
