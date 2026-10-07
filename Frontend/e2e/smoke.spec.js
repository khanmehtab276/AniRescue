import { test, expect } from 'playwright/test';

test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AniRescue/i);
  await expect(page.getByText(/AniRescue/i).first()).toBeVisible();
});

test('login page exposes email and password controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('authenticated session flow can be exercised when CI credentials are configured', async ({ page }) => {
  const email = globalThis.process?.env?.E2E_EMAIL;
  const password = globalThis.process?.env?.E2E_PASSWORD;

  test.skip(!email || !password, 'E2E_EMAIL/E2E_PASSWORD are not configured.');

  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).not.toHaveURL(/\/login$/);

  // MapView is a lazy-loaded production route. Visiting it here catches
  // runtime contract errors that lint/build checks cannot detect.
  await page.goto('/map');
  await expect(page.getByText(/AniRescue needs a quick refresh/i)).toHaveCount(0);
  await expect(page.getByText(/rescue map|dispatch|operations/i).first()).toBeVisible();
});
