import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// F83, F84: eat out. The restaurant list is canned with page.route (never the real foodpanda), the
// clock is fixed (never the real date), and the service worker is blocked so page.route sees fetches.
test.use({ serviceWorkers: 'block' });

const NOW = '2026-10-05T12:00:00+05:00';

const place = (name: string, url: string | null, extra: object = {}) => ({
  name, rating: 4.9, reviews: 17302, budget: 2, cuisines: ['Pizza'], url, distanceKm: 1.1, deliveryMinutes: 45, ...extra,
});
const canned = (generatedAt = '2026-10-01T08:00:00Z') => ({
  generatedAt,
  source: 'test',
  minReviews: 100,
  moods: {
    Pizza: [place('Pizza One', 'https://www.foodpanda.pk/restaurant/abc1/pizza-one'), place('Pizza Two', null)],
    Karahi: [place('Karahi King', 'https://www.foodpanda.pk/restaurant/abc2/karahi-king')],
    Burgers: [],
  },
});

async function serveList(page: Page, body: object | null) {
  await page.route('**/eatout/moods.json', route =>
    body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, body: 'not found' }));
}

async function openEatOut(page: Page) {
  await page.clock.setFixedTime(new Date(NOW));
  await openWithSamplePantry(page);
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  await expect(page.getByRole('heading', { name: 'Eat out tonight' })).toBeVisible();
}

async function addFavourite(page: Page, f: { dish: string; place: string; area?: string; url?: string; mood?: string }) {
  await page.getByRole('button', { name: 'Add a favourite' }).click();
  await page.getByLabel('Dish', { exact: true }).fill(f.dish);
  await page.getByLabel('Place name').fill(f.place);
  if (f.area) await page.getByLabel('Area (optional)').fill(f.area);
  if (f.url) await page.getByLabel('foodpanda link (optional)').fill(f.url);
  if (f.mood) await page.getByRole('group', { name: 'Moods' }).getByRole('button', { name: f.mood, exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test('favourites can be added, edited and deleted, and stay after a reload', async ({ page }) => {
  await serveList(page, null);
  await openEatOut(page);
  await addFavourite(page, { dish: 'Fajita pizza', place: 'Pizza Hut', area: 'F-7', mood: 'Pizza' });
  const card = page.getByRole('article', { name: 'Favourite Fajita pizza' });
  await expect(card).toContainText('Pizza Hut · F-7');
  await expect(card.getByRole('listitem')).toHaveText('Pizza');

  await page.reload();
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  await expect(page.getByRole('article', { name: 'Favourite Fajita pizza' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Fajita pizza' }).click();
  await page.getByLabel('Dish', { exact: true }).fill('Chicken tikka pizza');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Favourite Chicken tikka pizza' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Favourite Fajita pizza' })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  await expect(page.getByRole('article', { name: 'Favourite Chicken tikka pizza' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Chicken tikka pizza' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Favourite Chicken tikka pizza' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  await expect(page.getByText('Nothing saved yet.')).toBeVisible();
});

test('a bad foodpanda link on a favourite is refused', async ({ page }) => {
  await serveList(page, null);
  await openEatOut(page);
  await addFavourite(page, { dish: 'Tikka', place: 'Spot', url: 'http://foodpanda.pk/x' });
  await expect(page.getByRole('alert')).toContainText('https://');
  await expect(page.getByRole('heading', { name: 'Add a favourite' })).toBeVisible();
});

test('tapping a mood shows only that mood, with rating, price level and Updated date', async ({ page }) => {
  await serveList(page, canned());
  await openEatOut(page);
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Pizza One' })).toContainText('4.9 (17,302 reviews)');
  await expect(page.getByRole('article', { name: 'Pizza One' })).toContainText('price level Rs Rs');
  await expect(page.getByRole('article', { name: 'Pizza Two' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Karahi King' })).toHaveCount(0);
  await expect(page.getByText('Updated 1 Oct 2026').first()).toBeVisible();
  await expect(page.getByText('This list is old')).toHaveCount(0);
  await expect(page.getByText(/from Rs/i)).toHaveCount(0);
  await expect(page.getByText(/delivery|km/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Karahi', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Karahi King' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Pizza One' })).toHaveCount(0);
});

test('an old list says so', async ({ page }) => {
  await serveList(page, canned('2026-08-01T08:00:00Z'));
  await openEatOut(page);
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  await expect(page.getByText('Updated 1 Aug 2026').first()).toBeVisible();
  await expect(page.getByText('This list is old')).toBeVisible();
});

test('a mood with no places shows a friendly message, our favourites for it, and Search foodpanda', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://www.foodpanda.pk/**', route => route.fulfill({ body: '<title>foodpanda</title>', contentType: 'text/html' }));
  await serveList(page, canned());
  await openEatOut(page);
  await addFavourite(page, { dish: 'Zinger', place: 'Burger Lab', mood: 'Burgers' });
  await page.getByRole('button', { name: 'Burgers', exact: true }).click();
  await expect(page.getByText('No Burgers places in the list yet.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Our favourite Zinger' })).toContainText('Our favourite');
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Search foodpanda' }).click(),
  ]);
  await expect.poll(() => popup.url()).toContain('foodpanda.pk');
  await expect(page.locator('.eatout__note')).toContainText('Copied "Burgers"');
});

test('Order uses the saved link and opens a new page', async ({ page, context }) => {
  await context.route('https://www.foodpanda.pk/**', route => route.fulfill({ body: '<title>foodpanda</title>', contentType: 'text/html' }));
  await serveList(page, canned());
  await openEatOut(page);
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  const order = page.getByRole('link', { name: 'Order Pizza One' });
  await expect(order).toHaveAttribute('href', 'https://www.foodpanda.pk/restaurant/abc1/pizza-one');
  await expect(order).toHaveAttribute('rel', /noopener/);
  await expect(order).toHaveAttribute('target', '_blank');
  const [popup] = await Promise.all([context.waitForEvent('page'), order.click()]);
  await expect.poll(() => popup.url()).toContain('/restaurant/abc1/pizza-one');
});

test('with no link, Copy name and open foodpanda copies the name', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://www.foodpanda.pk/**', route => route.fulfill({ body: '<title>foodpanda</title>', contentType: 'text/html' }));
  await serveList(page, canned());
  await openEatOut(page);
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('article', { name: 'Pizza Two' }).getByRole('button', { name: 'Copy name and open foodpanda' }).click(),
  ]);
  await expect.poll(() => popup.url()).toContain('foodpanda.pk');
  await expect(page.locator('.eatout__note')).toContainText('Copied "Pizza Two"');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Pizza Two');
});

test('when copying fails, the name is shown to type instead', async ({ page, context }) => {
  await context.route('https://www.foodpanda.pk/**', route => route.fulfill({ body: '<title>foodpanda</title>', contentType: 'text/html' }));
  await serveList(page, canned());
  await openEatOut(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await page.getByRole('button', { name: 'Pizza', exact: true }).click();
  await page.getByRole('article', { name: 'Pizza Two' }).getByRole('button', { name: 'Copy name and open foodpanda' }).click();
  await expect(page.locator('.eatout__note')).toContainText('Could not copy. Type this into foodpanda');
  await expect(page.locator('.eatout__note')).toContainText('Pizza Two');
});

test('Ordered it and Directions on a favourite', async ({ page }) => {
  await serveList(page, null);
  await openEatOut(page);
  await addFavourite(page, { dish: 'Handi', place: 'Dera & Co', area: 'Blue Area', mood: 'Handi' });
  const card = page.getByRole('article', { name: 'Favourite Handi' });
  await expect(card.getByRole('link', { name: 'Directions to Dera & Co' })).toHaveAttribute(
    'href', 'https://www.google.com/maps/search/?api=1&query=Dera%20%26%20Co%2C%20Blue%20Area');
  await card.getByRole('button', { name: 'Ordered it Handi' }).click();
  await expect(page.getByText('Your favourite · last ordered today').first()).toBeVisible();
});

test('Settings: a malformed file changes nothing; a good file is used', async ({ page }) => {
  await serveList(page, canned());
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Restaurant list' });
  await expect(panel).toContainText('Updated 1 Oct 2026');
  await expect(panel).toContainText('came with the app');

  await panel.getByLabel('Restaurant list file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"generatedAt":"nope","moods":') });
  await expect(panel.getByRole('alert')).toContainText('Nothing was changed');
  await expect(panel).toContainText('Updated 1 Oct 2026');

  const newer = JSON.stringify({ ...canned('2026-10-04T08:00:00Z'), moods: { Pizza: [place('Imported Pizza', null)] } });
  await panel.getByLabel('Restaurant list file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(newer) });
  await expect(panel).toContainText('Updated 4 Oct 2026');
  await expect(panel).toContainText('loaded here');
  await panel.getByRole('button', { name: 'Remove loaded list' }).click();
  await expect(panel).toContainText('Updated 1 Oct 2026');
});
