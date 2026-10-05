import { expect, test } from '@playwright/test';
import { seed } from '../../src/data/seed';
import { demoPantry } from '../../src/data/demoPantry';
import { openWithSamplePantry } from './helpers';
import { cartOf, cartRow } from './cartKit';
import { addDishShortfall, removeItem } from '../../src/domain/shopping';
import { makeEvent } from '../../src/domain/ledger';
import { balances } from '../../src/domain/ledger';
import { availability } from '../../src/domain/suggest';
import { fromBase, toBase } from '../../src/domain/units';
import type { Ingredient } from '../../src/domain/types';

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const fmt = (base: number, i: Ingredient) => { const { amount, unit } = fromBase(base, i); return `${amount} ${unit}`; };
const nav = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name, exact: true }).click();

test('the shopping list survives a reload; a bought item stays gone and Pantry shows it once', async ({ page }) => {
  await openWithSamplePantry(page);
  const row = page.locator('.rows .row').first();
  const dish = (await row.locator('.row__name').innerText()).trim();
  const recipe = seed.recipes.find(r => r.name === dish)!;
  const before = balances(demoPantry);
  const a = availability(recipe, seed.settings.defaultServings, before, byId, toBase);
  expect(a.missing.length).toBeGreaterThan(0);

  await row.getByRole('button', { name: `Add what ${dish} needs to the shopping list` }).click();
  await expect(page.getByRole('status')).toContainText('Added to Shop');
  await expect(page.locator('.save-banner')).toHaveCount(0);

  const manual = addDishShortfall([], a);
  const cart = cartOf({ manual });
  const need = (id: string) => cart.find(l => l.ingredientId === id)!.amountBase!;
  await page.reload();
  await nav(page, 'Shop');
  for (const m of a.missing) {
    const ing = byId.get(m.ingredientId)!;
    await expect(cartRow(page, ing.name)).toContainText(fmt(need(m.ingredientId), ing));
  }
  await expect(page.locator('.shop-item')).toHaveCount(cart.length);

  const target = a.missing[0];
  const ing = byId.get(target.ingredientId)!;
  await page.getByRole('button', { name: `Got it: ${ing.name}`, exact: true }).click();
  await page.getByRole('button', { name: fmt(need(target.ingredientId), ing), exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Bought ${fmt(need(target.ingredientId), ing)} ${ing.name}`);

  // What the cart should look like now: the bought line left the manual list and stock went up once.
  const bought = makeEvent('purchase', [{ ingredientId: ing.id, delta: need(target.ingredientId), basis: 'measured' }], new Date());
  const after = cartOf({ manual: removeItem(manual, ing.id), events: [...demoPantry, bought] });
  await expect(page.locator('.shop-item')).toHaveCount(after.length);

  await page.reload();
  await nav(page, 'Shop');
  await expect(page.locator('.shop-item')).toHaveCount(after.length);
  // The bought item is no longer a manual line (it may still be there only if stock is still low).
  if (!after.some(l => l.ingredientId === ing.id)) await expect(page.getByRole('button', { name: `Got it: ${ing.name}`, exact: true })).toHaveCount(0);

  const now = (before.get(ing.id)?.amount ?? 0) + need(target.ingredientId);
  await nav(page, 'Pantry');
  const pantryRow = page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${ing.name.replace(/[()]/g, '\$&')}$`) }) });
  await expect(pantryRow).toContainText(fmt(now, ing));
});

test('an empty Shop list says what to do', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Shop');
  await expect(page.getByRole('heading', { name: 'To buy' })).toBeVisible();
  await expect(page.getByText('Nothing to buy. This list fills itself when something runs low or a dish is planned. You can also add an item.')).toBeVisible();
});
