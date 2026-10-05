import { formatAmount } from '../../src/lib/formatAmount';
import { expect, test, type Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { openWithSamplePantry } from './helpers';
import { cartOf, cartRow } from './cartKit';
import { addDishShortfall } from '../../src/domain/shopping';
import { balances } from '../../src/domain/ledger';
import { availability } from '../../src/domain/suggest';
import { toBase } from '../../src/domain/units';

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const fmt = formatAmount;
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

  // The cart is the manual list combined with low stock: the larger need, one line per item.
  const cart = cartOf({ manual: addDishShortfall([], a) });
  const need = (id: string) => cart.find(l => l.ingredientId === id)!.amountBase!;
  await nav(page, 'Shop');
  for (const m of a.missing) {
    const ing = byId.get(m.ingredientId)!;
    await expect(cartRow(page, ing.name)).toContainText(fmt(need(m.ingredientId), ing));
    await expect(cartRow(page, ing.name)).toContainText(`For ${dish}`);
  }

  // Tap Got it on the first missing item and say we bought the listed amount.
  const target = a.missing[0];
  const ing = byId.get(target.ingredientId)!;
  await cartRow(page, ing.name).getByRole('button', { name: `Got it: ${ing.name}`, exact: true }).click();
  await expect(page.getByText('How much did you buy?')).toBeVisible();
  await page.getByRole('button', { name: fmt(need(target.ingredientId), ing), exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Bought ${fmt(need(target.ingredientId), ing)} ${ing.name}`);

  const now = (before.get(ing.id)?.amount ?? 0) + need(target.ingredientId);
  await nav(page, 'Pantry');
  const pantryRow = page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${ing.name.replace(/[()]/g, '\$&')}$`) }) });
  await expect(pantryRow).toContainText(fmt(now, ing));
});
