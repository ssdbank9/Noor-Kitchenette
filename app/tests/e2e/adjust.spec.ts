import { formatAmount } from '../../src/lib/formatAmount';
import { expect, test, type Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { openWithSamplePantry } from './helpers';
import { balances, makeEvent, type Balance } from '../../src/domain/ledger';
import { availability } from '../../src/domain/suggest';
import { toBase } from '../../src/domain/units';
import { buildUsage, initialUsage, stepUsed, usageMovements } from '../../src/domain/usage';
import type { Ingredient } from '../../src/domain/types';

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const fmt = formatAmount;

function pantryText(b: Balance | undefined, i: Ingredient): string {
  if (!b) return 'none';
  if (b.amount === null) return 'not sure';
  if (b.needsCheck) return 'check stock';
  return fmt(b.amount, i);
}

function pantryRow(page: Page, name: string) {
  return page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) });
}

test('Nahi: adjust one ingredient to None and another to more, stock follows, undo restores', async ({ page }) => {
  await openWithSamplePantry(page);
  await page.getByRole('button', { name: /let's cook/ }).click();
  const name = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  const r = seed.recipes.find(x => x.name === name)!;
  const before = balances(demoPantry);
  const lines = buildUsage(availability(r, 4, before, byId, toBase), r, byId);
  expect(lines[0].editable && lines[1].editable, 'first two ingredients can be adjusted').toBe(true);

  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Nahi', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: 'What did you use?' })).toBeVisible();
  const rows = page.locator('.usage-row');
  await rows.nth(0).getByRole('button', { name: 'None' }).click();
  await rows.nth(1).getByRole('button', { name: /^More / }).click();

  const used = initialUsage(lines);
  used[lines[0].ingredientId] = 0;
  used[lines[1].ingredientId] = stepUsed(lines[1], used[lines[1].ingredientId], 1);
  const expected = usageMovements(lines, used);
  const cook = makeEvent('cook', expected, new Date());
  const after = balances([...demoPantry, cook]);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Pantry updated');

  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  const first = byId.get(lines[0].ingredientId)!;
  const second = byId.get(lines[1].ingredientId)!;
  await expect(pantryRow(page, first.name)).toContainText(pantryText(before.get(first.id), first));
  await expect(pantryRow(page, second.name)).toContainText(pantryText(after.get(second.id), second));
  for (const m of expected) {
    const ing = byId.get(m.ingredientId)!;
    await expect(pantryRow(page, ing.name)).toContainText(pantryText(after.get(ing.id), ing));
  }

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.getByText('Nothing recorded yet')).toBeVisible();

  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  for (const ing of [first, second]) {
    await expect(pantryRow(page, ing.name)).toContainText(pantryText(before.get(ing.id), ing));
  }
});

test('Exact amount rejects blanks and negatives and blocks Save', async ({ page }) => {
  await openWithSamplePantry(page);
  await page.getByRole('button', { name: /let's cook/ }).click();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Nahi', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('.usage-row').first();
  await row.getByRole('button', { name: 'Exact amount' }).click();
  const input = row.getByLabel('Exact amount');
  await input.fill('-3');
  await expect(row.getByRole('alert')).toContainText('negative');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await input.fill('');
  await expect(row.getByRole('alert')).toBeVisible();
  await input.fill('0');
  await expect(row.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});
