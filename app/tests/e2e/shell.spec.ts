import { expect, test } from '@playwright/test';

test('opens at phone width with the greeting and no sideways scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Assalam-o-alaikum, Noor' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('shows the date in Karachi time', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T20:30:00Z')); // 1:30 a.m., 1 Oct in Karachi
  await page.goto('/');
  await expect(page.getByText('Thursday · 1 October')).toBeVisible();
});

test('is installable: manifest, service worker, and no Chrome installability errors', async ({ page, context }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest.name).toBe("Noor's Kitchen");
  expect(manifest.display).toBe('standalone');

  await page.evaluate(() => navigator.serviceWorker.ready);
  const client = await context.newCDPSession(page);
  const { installabilityErrors } = await client.send('Page.getInstallabilityErrors');
  // Playwright's test browser is a private (incognito) window, where Chrome never offers
  // installs; that one reason is about the test setup, so it is the only one ignored.
  const appErrors = installabilityErrors.filter(e => e.errorId !== 'in-incognito');
  expect(appErrors).toEqual([]);
});
