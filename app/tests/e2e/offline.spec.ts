import { expect, test } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// The service worker precaches the app, so a reload with no network still opens it,
// with the recipes and the data saved in IndexedDB.
test('the app opens offline with recipes and saved data', async ({ page, context }) => {
  await openWithSamplePantry(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Save something, so we can see saved data survive offline.
  await page.getByRole('button', { name: /let's cook/ }).click();
  const name = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText(`Saved ${name}`);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'See all' })).toBeVisible();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  await expect(page.locator('.pantry-item').first()).toBeVisible();
  await context.setOffline(false);
});
