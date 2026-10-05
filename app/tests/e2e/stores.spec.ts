import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseBackup } from '../../src/storage/backup';
import { openWithSamplePantry } from './helpers';

// D-22: Settings -> Stores. The To-buy screen is wired separately, so only the panel is
// driven here; the pure link and grouping rules are covered by src/domain/stores.test.ts.

const openStores = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stores', exact: true })).toBeVisible();
};
const panel = (page: Page) => page.locator('section[aria-labelledby="set-stores"]');

async function addStore(page: Page, name: string, kind: string, fields: Record<string, string> = {}) {
  await page.getByRole('button', { name: 'Add a store' }).click();
  await page.getByRole('textbox', { name: 'Store name' }).fill(name);
  await page.getByRole('button', { name: kind, exact: true }).click();
  for (const [label, value] of Object.entries(fields)) await page.getByRole('textbox', { name: label }).fill(value);
  await page.getByRole('button', { name: 'Save store' }).click();
}

test('the usual stores are listed with the no-prices note', async ({ page }) => {
  await openWithSamplePantry(page);
  await openStores(page);
  const p = panel(page);
  for (const n of ['Al-Fatah', 'pandamart (foodpanda)', 'Carrefour', 'Local shops (I-8 Markaz)']) await expect(p.getByText(n, { exact: true })).toBeVisible();
  await expect(p.getByText("Prices and stock are not shown. Links open the store's website; they may open its app on your phone.")).toBeVisible();
});

test('a store of each kind can be added, only its own fields show', async ({ page }) => {
  await openWithSamplePantry(page);
  await openStores(page);
  const p = panel(page);

  await page.getByRole('button', { name: 'Add a store' }).click();
  await expect(page.getByRole('textbox', { name: 'Search link' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Link to open' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy the list then open' }).click();
  await expect(page.getByRole('textbox', { name: 'Link to open' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search link' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await addStore(page, 'Metro', 'Search a website', { 'Search link': 'https://metro.pk/search?q={q}' });
  await expect(p.getByText('Metro added.')).toBeVisible();
  await addStore(page, 'Grocer App', 'Copy the list then open', { 'Link to open': 'https://grocer.pk/' });
  await expect(p.getByText('Grocer App added.')).toBeVisible();
  await addStore(page, 'Bhai Kiryana', 'Directions only', { 'Map search': 'kiryana store I-8 Markaz' });
  await expect(p.getByText('Bhai Kiryana added.')).toBeVisible();
  for (const n of ['Metro', 'Grocer App', 'Bhai Kiryana']) await expect(p.locator('.stores-list__text strong', { hasText: n })).toBeVisible();
});

test('an invalid store is refused with a message and nothing is added', async ({ page }) => {
  await openWithSamplePantry(page);
  await openStores(page);
  await page.getByRole('button', { name: 'Add a store' }).click();
  await page.getByRole('button', { name: 'Save store' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Give the store a name.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'search link' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Store name' }).fill('Bad');
  await page.getByRole('textbox', { name: 'Search link' }).fill('javascript:alert(1)//{q}');
  await page.getByRole('button', { name: 'Save store' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'must start with https://' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search link' }).fill('http://bad.pk/?q={q}');
  await page.getByRole('button', { name: 'Save store' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'must start with https://' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search link' }).fill('https://bad.pk/');
  await page.getByRole('button', { name: 'Save store' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '{q}' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page).locator('.stores-list__text strong', { hasText: 'Bad' })).toHaveCount(0);
});

test('a store can be edited and deleted (with Yes/No), and the usual stores come back', async ({ page }) => {
  await openWithSamplePantry(page);
  await openStores(page);
  const p = panel(page);

  await page.getByRole('button', { name: 'Edit Carrefour' }).click();
  await page.getByRole('textbox', { name: 'Store name' }).fill('Carrefour Centaurus');
  await page.getByRole('button', { name: 'Save store' }).click();
  await expect(p.getByText('Carrefour Centaurus saved.')).toBeVisible();
  await expect(p.locator('.stores-list__text strong', { hasText: 'Carrefour Centaurus' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Al-Fatah' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Delete Al-Fatah' })).toBeVisible();
  await page.getByRole('button', { name: 'Nahi', exact: true }).click();
  await expect(p.locator('.stores-list__text strong', { hasText: 'Al-Fatah' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Al-Fatah' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(p.locator('.stores-list__text strong', { hasText: 'Al-Fatah' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset to the usual stores' }).click();
  await page.getByRole('button', { name: 'Nahi', exact: true }).click();
  await expect(p.locator('.stores-list__text strong', { hasText: 'Al-Fatah' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset to the usual stores' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(p.locator('.stores-list__text strong', { hasText: 'Al-Fatah' })).toBeVisible();
  await expect(p.locator('.stores-list__text strong', { hasText: 'Carrefour' })).toHaveText('Carrefour');
});

test('stores survive a reload and are in the backup file', async ({ page }) => {
  await openWithSamplePantry(page);
  await openStores(page);
  await addStore(page, 'Metro', 'Search a website', { 'Search link': 'https://metro.pk/search?q={q}' });
  await expect(panel(page).getByText('Metro added.')).toBeVisible();

  await expect(page.locator('.save-banner')).toHaveCount(0);
  await page.reload();
  await openStores(page);
  await expect(panel(page).locator('.stores-list__text strong', { hasText: 'Metro' })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);
  const text = readFileSync(await download.path(), 'utf8');
  const parsed = parseBackup(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const stores = parsed.data.shopPrefs?.stores ?? [];
  expect(stores.map(s => s.name)).toEqual(['Al-Fatah', 'pandamart (foodpanda)', 'Carrefour', 'Local shops (I-8 Markaz)', 'Metro']);
  expect(stores.at(-1)).toMatchObject({ id: 'metro', kind: 'online-search', searchUrl: 'https://metro.pk/search?q={q}' });
});
