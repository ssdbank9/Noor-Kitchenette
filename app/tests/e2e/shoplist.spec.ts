import { expect, test } from '@playwright/test';
import { seed } from '../../src/data/seed';
import { balances } from '../../src/domain/ledger';
import { availability } from '../../src/domain/suggest';
import { fromBase, toBase } from '../../src/domain/units';
import type { Ingredient } from '../../src/domain/types';

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const fmt = (base: number, i: Ingredient) => { const { amount, unit } = fromBase(base, i); return `${amount} ${unit}`; };
const nav = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name, exact: true }).click();

test('the shopping list survives a reload; a bought item stays gone and Pantry shows it once', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('.rows .row').first();
  const dish = (await row.locator('.row__name').innerText()).trim();
  const recipe = seed.recipes.find(r => r.name === dish)!;
  const before = balances(seed.events);
  const a = availability(recipe, seed.settings.defaultServings, before, byId, toBase);
  expect(a.missing.length).toBeGreaterThan(0);

  await row.getByRole('button', { name: `Add what ${dish} needs to the shopping list` }).click();
  await expect(page.getByRole('status')).toContainText('Added to Shop');
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await page.reload();
  await nav(page, 'Shop');
  for (const m of a.missing) {
    const ing = byId.get(m.ingredientId)!;
    await expect(page.locator('.shop-item').filter({ hasText: ing.name }).first()).toContainText(fmt(m.short!, ing));
  }
  const count = a.missing.length;
  await expect(page.locator('.shop-item')).toHaveCount(count);

  const target = a.missing[0];
  const ing = byId.get(target.ingredientId)!;
  await page.getByRole('button', { name: `Bought ${ing.name}`, exact: true }).click();
  await page.getByRole('button', { name: fmt(target.short!, ing), exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Bought ${fmt(target.short!, ing)} ${ing.name}`);
  await expect(page.locator('.shop-item')).toHaveCount(count - 1);

  await page.reload();
  await nav(page, 'Shop');
  await expect(page.locator('.shop-item')).toHaveCount(count - 1);
  await expect(page.getByRole('button', { name: `Bought ${ing.name}`, exact: true })).toHaveCount(0);

  const now = (before.get(ing.id)?.amount ?? 0) + target.short!;
  await nav(page, 'Pantry');
  const pantryRow = page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${ing.name.replace(/[()]/g, '\\$&')}$`) }) });
  await expect(pantryRow).toContainText(fmt(now, ing));
});

test('an empty Shop list says what to do', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Shop');
  await expect(page.getByText('Nothing on the list. Tap + List on a dish or add low-stock items.')).toBeVisible();
});
