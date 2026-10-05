import { expect, test, type Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { openWithSamplePantry } from './helpers';
import { balances } from '../../src/domain/ledger';
import { availability } from '../../src/domain/suggest';
import { fromBase, toBase } from '../../src/domain/units';
import type { Ingredient } from '../../src/domain/types';

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const fmt = (base: number, i: Ingredient) => { const { amount, unit } = fromBase(base, i); return `${amount} ${unit}`; };
const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

test('Recipes search keeps focus while typing and shows only daal dishes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'See all' }).click();
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  await search.click();
  await page.keyboard.type('daal', { delay: 40 });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('daal');

  const expected = seed.recipes.filter(r => /daal/i.test(r.name)).map(r => r.name);
  expect(expected.length).toBeGreaterThan(0);
  const names = page.locator('.recipes .row__name');
  await expect(names).toHaveCount(expected.length);
  expect((await names.allInnerTexts()).sort()).toEqual([...expected].sort());
  // Every row says Ready, Need N or Check stock.
  for (const badge of await page.locator('.recipes .badge').allInnerTexts()) expect(badge).toMatch(/^(Ready|Need \d+|Check stock)$/);

  // A category chip narrows the list, and tapping a row opens the recipe.
  await page.getByRole('button', { name: 'Daal & Beans', exact: true }).click();
  await names.first().click();
  await expect(page.getByRole('button', { name: 'I cooked this' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
});

test('+ List puts an almost-there dish\'s missing items in Shop, and buying them raises the Pantry amount', async ({ page }) => {
  await openWithSamplePantry(page);
  const row = page.locator('.rows .row').first();
  const dish = (await row.locator('.row__name').innerText()).trim();
  const recipe = seed.recipes.find(r => r.name === dish)!;
  const before = balances(demoPantry);
  const a = availability(recipe, seed.settings.defaultServings, before, byId, toBase);
  expect(a.missing.length).toBeGreaterThan(0);

  await row.getByRole('button', { name: `Add what ${dish} needs to the shopping list` }).click();
  await expect(page.getByRole('status')).toContainText('Added to Shop');

  await nav(page, 'Shop');
  for (const m of a.missing) {
    const ing = byId.get(m.ingredientId)!;
    await expect(page.locator('.shop-item').filter({ hasText: ing.name }).first()).toContainText(fmt(m.short!, ing));
  }

  // Tick the first missing item and say we bought the listed amount.
  const target = a.missing[0];
  const ing = byId.get(target.ingredientId)!;
  const item = page.locator('.shop-item').filter({ has: page.getByRole('button', { name: `Bought ${ing.name}`, exact: true }) });
  await item.getByRole('button', { name: `Bought ${ing.name}`, exact: true }).click();
  await expect(page.getByText('How much did you buy?')).toBeVisible();
  await page.getByRole('button', { name: fmt(target.short!, ing), exact: true }).click();
  await expect(page.getByRole('button', { name: `Bought ${ing.name}`, exact: true })).toHaveCount(0);

  const now = (before.get(ing.id)?.amount ?? 0) + target.short!;
  await nav(page, 'Pantry');
  const pantryRow = page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${ing.name.replace(/[()]/g, '\\$&')}$`) }) });
  await expect(pantryRow).toContainText(fmt(now, ing));
});
