import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// D-22: eat out, nearest first from the home area. The list is canned with page.route (never the
// real foodpanda), the clock is fixed, and the service worker is blocked so page.route sees fetches.
// The only home coordinates used are the public I-8 Markaz ones, and geolocation is mocked.
test.use({ serviceWorkers: 'block' });

const NOW = '2026-10-05T12:00:00+05:00';

const place = (name: string, rating: number, extra: object = {}) => ({
  name, rating, reviews: 900, budget: 2, cuisines: ['Pizza'], url: null, ...extra,
});
const LIST = {
  generatedAt: '2026-10-01T08:00:00Z',
  source: 'test',
  moods: {
    Pizza: [
      place('Far Pizza', 4.9, { lat: 33.72, lng: 73.056 }), // about 6 km from I-8 Markaz
      place('Nowhere Pizza', 4.8), // no coordinates
      place('Mid Pizza', 4.5, { lat: 33.69, lng: 73.08 }), // about 2.5 km
      place('Near Pizza', 4.1, { lat: 33.672, lng: 73.075 }), // about 0.4 km
      place('Broken Pizza', 4.0, { lat: 999, lng: 73.1 }), // invalid coordinates: ignored, place stays
    ],
  },
};

async function serveList(page: Page) {
  await page.route('**/eatout/moods.json', route => route.fulfill({ json: LIST }));
}

const openSettings = (page: Page) => page.getByRole('button', { name: 'Settings', exact: true }).click();
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true }).click();

async function start(page: Page) {
  await page.clock.setFixedTime(new Date(NOW));
  await serveList(page);
  await openWithSamplePantry(page);
}

async function pizzaNames(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Near Pizza' })).toBeVisible();
  return page.locator('article[aria-label$=" Pizza"]').evaluateAll(els => els.map(e => e.getAttribute('aria-label') ?? ''));
}

test('without a home area a gentle prompt shows and the order is best rated', async ({ page }) => {
  await start(page);
  const names = await pizzaNames(page);
  expect(names).toEqual(['Far Pizza', 'Nowhere Pizza', 'Mid Pizza', 'Near Pizza', 'Broken Pizza']);
  await expect(page.getByRole('button', { name: 'Set where you live in Settings to see the nearest' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nearest first' })).toHaveCount(0);
  await expect(page.getByText(/km away/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Set where you live in Settings to see the nearest' }).click();
  await expect(page.getByRole('heading', { name: 'Where we live' })).toBeVisible();
});

test('the I-8 preset sorts nearest first with distances, the toggle gives best rated, places without coordinates go last', async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(page.getByText('No area chosen yet.')).toBeVisible();
  await page.getByRole('button', { name: 'I-8 Markaz, Islamabad' }).click();
  await expect(page.getByText('Nearest restaurants are measured from')).toContainText('I-8 Markaz, Islamabad');
  await back(page);

  expect(await pizzaNames(page)).toEqual(['Near Pizza', 'Mid Pizza', 'Far Pizza', 'Nowhere Pizza', 'Broken Pizza']);
  await expect(page.getByRole('button', { name: 'Nearest first' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article', { name: 'Near Pizza' })).toContainText('~0.4 km away');
  await expect(page.getByRole('article', { name: 'Mid Pizza' })).toContainText(/~2\.\d km away/);
  await expect(page.getByRole('article', { name: 'Far Pizza' })).toContainText(/~[56]\.\d km away/);
  await expect(page.getByRole('article', { name: 'Nowhere Pizza' })).not.toContainText('km');
  await expect(page.getByRole('article', { name: 'Broken Pizza' })).not.toContainText('km');
  await expect(page.getByText('Set where you live')).toHaveCount(0);

  await page.getByRole('button', { name: 'Best rated' }).click();
  const names = await page.locator('article[aria-label$=" Pizza"]').evaluateAll(els => els.map(e => e.getAttribute('aria-label') ?? ''));
  expect(names).toEqual(['Far Pizza', 'Nowhere Pizza', 'Mid Pizza', 'Near Pizza', 'Broken Pizza']);
});

test('Use my location works with permission and a mocked position, rounded to 3 decimals', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.71234, longitude: 73.04567 });
  await start(page);
  await openSettings(page);
  await expect(page.getByText('Your phone will ask to share your location.')).toBeVisible();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved: My location.' })).toBeVisible();
  await expect(page.getByText('Nearest restaurants are measured from')).toContainText('My location');
  await back(page);

  // From (33.712, 73.046) the "far" place is the nearest one.
  expect(await pizzaNames(page)).toEqual(['Far Pizza', 'Mid Pizza', 'Near Pizza', 'Nowhere Pizza', 'Broken Pizza']);
  await expect(page.getByRole('article', { name: 'Far Pizza' })).toContainText(/~1\.\d km away/);
});

test('a denied location shows a plain message and keeps the old area', async ({ page, context }) => {
  await context.clearPermissions();
  await start(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'I-8 Markaz, Islamabad' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByText(/Location was not allowed/)).toBeVisible();
  await expect(page.getByText('Nearest restaurants are measured from')).toContainText('I-8 Markaz, Islamabad');
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeEnabled();
});

test('the area survives a reload and a backup round trip, and Clear removes it', async ({ page }) => {
  await start(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'I-8 Markaz, Islamabad' }).click();
  await expect(page.getByText('Nearest restaurants are measured from')).toBeVisible();

  await page.reload();
  await openSettings(page);
  await expect(page.getByText('Nearest restaurants are measured from')).toContainText('I-8 Markaz, Islamabad');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save a backup' }).click(),
  ]);
  const text = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(text).settings.homeArea).toEqual({ label: 'I-8 Markaz, Islamabad', lat: 33.668, lng: 73.075 });

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('No area chosen yet.')).toBeVisible();
  await page.reload();
  await openSettings(page);
  await expect(page.getByText('No area chosen yet.')).toBeVisible();

  await page.getByLabel('Backup file').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(page.getByText('Restored.')).toBeVisible();
  await expect(page.getByText('Nearest restaurants are measured from')).toContainText('I-8 Markaz, Islamabad');
});
