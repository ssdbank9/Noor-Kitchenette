import { formatAmount } from '../../src/lib/formatAmount';
import { expect, test, type Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { openWithSamplePantry } from './helpers';
import { balances, makeEvent, type Balance } from '../../src/domain/ledger';
import { availability } from '../../src/domain/suggest';
import { toBase } from '../../src/domain/units';
import type { Ingredient, Recipe } from '../../src/domain/types';

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const recipeNamed = (name: string): Recipe => seed.recipes.find(r => r.name === name)!;
const fmt = formatAmount;

// A fixed clock keeps the next-meal slot stable (at 10:00 Karachi that is lunch, which most
// dishes suit), so "Show another" always has more than one suggestion to rotate through.
const NOW = new Date('2026-10-05T10:00:00+05:00');

/** What the Pantry screen should say for a balance. */
function pantryText(b: Balance | undefined, i: Ingredient): string {
  if (!b) return 'none';
  if (b.amount === null) return 'not sure';
  if (b.needsCheck) return 'check stock';
  return fmt(b.amount, i);
}

async function pantryRow(page: Page, name: string) {
  return page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) });
}

async function openSuggested(page: Page): Promise<Recipe> {
  await page.getByRole('button', { name: /let's cook/ }).click();
  const name = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  return recipeNamed(name);
}

test('cooking deducts exactly the recipe amounts, and undo puts every one back', async ({ page }) => {
  await openWithSamplePantry(page);
  const recipe = await openSuggested(page);
  const before = balances(demoPantry);
  const servings = 4;
  const needs = availability(recipe, servings, before, byId, toBase).needs.filter(n => n.need !== null && n.need > 0);
  expect(needs.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const cook = makeEvent('cook', needs.map(n => ({ ingredientId: n.ingredientId, delta: -n.need!, basis: 'measured' as const })), new Date());
  const after = balances([...demoPantry, cook]);

  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  for (const n of needs) {
    const ing = byId.get(n.ingredientId)!;
    await expect(await pantryRow(page, ing.name), `${ing.name} after cooking`).toContainText(pantryText(after.get(ing.id), ing));
  }

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText(recipe.name).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.getByText('Nothing recorded yet')).toBeVisible();

  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  for (const n of needs) {
    const ing = byId.get(n.ingredientId)!;
    await expect(await pantryRow(page, ing.name), `${ing.name} after undo`).toContainText(pantryText(before.get(ing.id), ing));
  }
});

test('opening another recipe shows that recipe\'s own ingredients, and the people count rescales them', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openWithSamplePantry(page);
  const first = await openSuggested(page);
  const names = (r: Recipe) => r.ingredients.slice(0, 4).map(ri => byId.get(ri.ingredientId)!.name);
  await expect(page.locator('.ingredient__name')).toHaveText(names(first));

  // The stepper rescales the first ingredient's amount for one more person.
  const ri = first.ingredients[0];
  const ing = byId.get(ri.ingredientId)!;
  const forServings = (n: number) => {
    const r = toBase((ri.amount * n) / first.serves, ri.unit, ing);
    return r.ok ? fmt(r.value, ing) : 'see recipe';
  };
  await expect(page.locator('.ingredient__amounts').first()).toContainText(forServings(4));
  await page.getByRole('button', { name: 'More people' }).click();
  await expect(page.locator('.ingredient__amounts').first()).toContainText(forServings(5));

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Show another' }).click();
  const second = await openSuggested(page);
  expect(second.id).not.toBe(first.id);
  await expect(page.locator('.ingredient__name')).toHaveText(names(second));
  await expect(page.locator('.stepper output')).toHaveText('4');
});
