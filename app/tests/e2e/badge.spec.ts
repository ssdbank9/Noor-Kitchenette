import { expect, test } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// Netlify can overlay a fixed "Powered by Netlify" badge (197 x 64, bottom-right, top-most).
// Playwright refuses to click an element another element covers, so these clicks only
// succeed if the app keeps its bottom controls clear of the badge.
test('bottom controls stay tappable when a host badge covers the bottom-right corner', async ({ page }) => {
  await openWithSamplePantry(page);
  await page.evaluate(() => {
    const badge = document.createElement('iframe');
    badge.id = 'nl-badge-frame';
    badge.title = 'Powered by Netlify';
    badge.style.cssText = 'position:fixed;right:0;bottom:0;width:197px;height:64px;border:0;z-index:2147483645;';
    document.body.appendChild(badge);
  });
  await page.getByRole('button', { name: 'Shop', exact: true }).click({ timeout: 5000 });
  await page.getByRole('button', { name: 'History', exact: true }).click({ timeout: 5000 });
  await page.getByRole('button', { name: 'Today', exact: true }).click({ timeout: 5000 });
  await page.getByRole('button', { name: /let's cook/ }).click();
  await page.getByRole('button', { name: 'I cooked this' }).click({ timeout: 5000 });
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click({ timeout: 5000 });
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
});

test('without a badge the layout is unchanged: the bottom bar sits at the very bottom', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  const gap = await page.evaluate(() => window.innerHeight - document.querySelector('.bottom-nav')!.getBoundingClientRect().bottom);
  expect(gap).toBe(0);
});
