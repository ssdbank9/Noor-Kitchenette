import { expect, test, type Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { basketFromPlan } from '../../src/domain/basket';
import { cartOf, cartRow } from './cartKit';
import { balances, makeEvent } from '../../src/domain/ledger';
import { addDish, cancelMeal, competition, newMeal, setCooked } from '../../src/domain/plan';
import { fromBase, toBase } from '../../src/domain/units';
import type { Ingredient, PlannedMeal, Recipe } from '../../src/domain/types';
import { openWithSamplePantry } from './helpers';

// Every date here is relative to a fixed clock, never the real one: Monday 5 October 2026, 10:00 in Karachi.
const TODAY = '2026-10-05';
const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const recipe = (id: string): Recipe => seed.recipes.find(r => r.id === id)!;
const KARAHI = recipe('R004'); // Chicken Karahi (Fire): 800 g chicken for 5, so 640 g for 4
const PULAO = recipe('R002'); // Chicken Yakhni Pulao: 800 g chicken for 5
const DAAL = recipe('R006a'); // Daal Chana (Masala)
const fmt = (base: number, i: Ingredient) => { const { amount, unit } = fromBase(base, i); return `${amount} ${unit}`; };
const SERVINGS = seed.settings.defaultServings;

function mealOf(id: string, slot: PlannedMeal['slot'], ...recipes: Recipe[]): PlannedMeal {
  return recipes.reduce((m, r) => addDish(m, r), newMeal(id, TODAY, slot, SERVINGS));
}

async function start(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+05:00'));
  await openWithSamplePantry(page);
  // A fixed clock never moves, so later entries would share the sample pantry's exact instant.
  // Move it one minute on, still fixed, so purchases are recorded after the sample stock.
  await page.clock.setFixedTime(new Date('2026-10-05T10:01:00+05:00'));
}
const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const slot = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function addDishTo(page: Page, slotName: string, dish: Recipe, verb = 'Add') {
  await slot(page, slotName).getByRole('button', { name: new RegExp(`^(Add a dish to|Add another dish to) ${slotName}$`) }).click();
  const sheet = page.getByRole('dialog');
  const search = sheet.getByRole('searchbox', { name: 'Search dishes' });
  await search.click();
  await page.keyboard.type(dish.name.slice(0, 6), { delay: 30 });
  await expect(search).toBeFocused(); // typing never loses focus
  await sheet.getByRole('button', { name: `${verb} ${dish.name}`, exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

async function pantrySnapshot(page: Page): Promise<string[]> {
  await nav(page, 'Pantry');
  const rows = await page.locator('.pantry-item').allInnerTexts();
  await nav(page, 'Today');
  return rows;
}

async function pantryChicken(page: Page): Promise<string> {
  await nav(page, 'Pantry');
  const row = page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: /^Chicken$/ }) });
  const text = await row.innerText();
  await nav(page, 'Today');
  return text;
}

test('two meals sharing chicken warn, fill the cart exactly, survive a partial buy, and shrink when one is cancelled', async ({ page }) => {
  await start(page);
  const pantryBefore = await pantrySnapshot(page);

  await nav(page, 'Plan');
  await addDishTo(page, 'Lunch', KARAHI);
  await addDishTo(page, 'Dinner', PULAO);

  // Planning never changes the pantry.
  expect(await pantrySnapshot(page)).toEqual(pantryBefore);

  const plan = [mealOf('a', 'lunch', KARAHI), mealOf('b', 'dinner', PULAO)];
  const stock = balances(demoPantry);
  const chicken = competition(plan, seed.recipes, stock, seed.ingredients, toBase, TODAY, demoPantry).find(c => c.ingredientId === 'Chicken')!;
  expect(chicken.need).toBeGreaterThan(chicken.have);
  const warning = `Chicken: 2 meals need ${fmt(chicken.need, byId.get('Chicken')!)}, you have ${fmt(chicken.have, byId.get('Chicken')!)}`;
  await nav(page, 'Plan');
  await expect(page.getByRole('region', { name: 'Heads up for this day' })).toContainText(warning);
  await expect(page.getByRole('region', { name: 'Heads up this week' })).toContainText(warning);
  await expect(page.getByRole('region', { name: 'Heads up this week' })).toContainText('Chicken Karahi (Fire)');

  // The cart: every planned line is the combined need minus stock, counted once; low stock joins it.
  await nav(page, 'Shop');
  const lines = basketFromPlan(plan, seed.recipes, stock, seed.ingredients, toBase, TODAY, demoPantry);
  const cart = cartOf({ plan });
  const chickenLine = lines.find(l => l.ingredientId === 'Chicken')!;
  expect(chickenLine.amountBase).toBe(chicken.need - chicken.have);
  expect(cart.find(l => l.ingredientId === 'Chicken')!.amountBase).toBe(chickenLine.amountBase);
  await expect(page.locator('.shop-item')).toHaveCount(cart.length);
  const planned = cart.filter(l => l.reasons.plan);
  expect(planned.length).toBeGreaterThanOrEqual(lines.length);
  for (const l of planned) {
    const ing = byId.get(l.ingredientId)!;
    await expect(cartRow(page, ing.name)).toContainText(l.amountBase === null ? 'Check' : fmt(l.amountBase, ing));
  }
  await expect(cartRow(page, 'Chicken')).toContainText('For Chicken Karahi (Fire) Mon');

  // A partial purchase raises the pantry and leaves the remainder.
  const half = chickenLine.amountBase! / 2;
  await cartRow(page, 'Chicken').getByRole('button', { name: 'Got it: Chicken', exact: true }).click();
  await page.getByRole('button', { name: `Half · ${fmt(half, byId.get('Chicken')!)}`, exact: true }).click();
  const bought = makeEvent('purchase', [{ ingredientId: 'Chicken', delta: half, basis: 'measured' }], new Date('2026-10-05T10:01:00+05:00'));
  const afterBuy = [...demoPantry, bought];
  const rest = basketFromPlan(plan, seed.recipes, balances(afterBuy), seed.ingredients, toBase, TODAY, afterBuy).find(l => l.ingredientId === 'Chicken')!;
  expect(rest.amountBase).toBe(chickenLine.amountBase! - half);
  await expect(cartRow(page, 'Chicken')).toContainText(fmt(rest.amountBase!, byId.get('Chicken')!));
  expect(await pantryChicken(page)).toContain(fmt((balances(afterBuy).get('Chicken')!.amount as number), byId.get('Chicken')!));

  // Cancel the dinner (Haan): its needs leave the cart.
  await nav(page, 'Plan');
  await slot(page, 'Dinner').getByRole('button', { name: 'Cancel Dinner', exact: true }).click();
  await page.getByRole('group', { name: 'Cancel Dinner?' }).getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(slot(page, 'Dinner')).toContainText('Cancelled');
  const planAfterCancel = [plan[0], cancelMeal(plan[1])];
  const linesAfterCancel = basketFromPlan(planAfterCancel, seed.recipes, balances(afterBuy), seed.ingredients, toBase, TODAY, afterBuy);
  expect(linesAfterCancel.length).toBeLessThan(lines.length);
  expect(linesAfterCancel.find(l => l.ingredientId === 'Chicken')).toBeUndefined();
  const cartAfterCancel = cartOf({ plan: planAfterCancel, events: afterBuy });
  await nav(page, 'Shop');
  await expect(page.locator('.shop-item')).toHaveCount(cartAfterCancel.length);
  await expect(page.getByRole('button', { name: 'Got it: Chicken', exact: true })).toHaveCount(0);

  // Restoring brings the dinner back.
  await nav(page, 'Plan');
  await slot(page, 'Dinner').getByRole('button', { name: 'Restore Dinner', exact: true }).click();
  await nav(page, 'Shop');
  await expect(page.locator('.shop-item')).toHaveCount(cartOf({ plan, events: afterBuy }).length);
});

test('a meal can hold several dishes, a dish can be swapped, and the plan survives a reload', async ({ page }) => {
  await start(page);
  await nav(page, 'Plan');
  await addDishTo(page, 'Lunch', KARAHI);
  await addDishTo(page, 'Lunch', DAAL);
  const lunch = slot(page, 'Lunch');
  await expect(lunch).toContainText(KARAHI.name);
  await expect(lunch).toContainText(DAAL.name);

  await lunch.getByRole('button', { name: `Swap ${KARAHI.name}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('searchbox', { name: 'Search dishes' }).fill('Yakhni');
  await page.getByRole('dialog').getByRole('button', { name: `Swap to ${PULAO.name}`, exact: true }).click();
  await expect(lunch).toContainText(PULAO.name);
  await expect(lunch).not.toContainText(KARAHI.name);
  await expect(lunch).toContainText(DAAL.name);

  // Servings stepper per meal.
  await lunch.getByRole('button', { name: 'More people for Lunch' }).click();
  await expect(lunch.getByRole('status', { name: 'People eating Lunch' })).toHaveText(String(SERVINGS + 1));
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await page.reload();
  await nav(page, 'Plan');
  await expect(slot(page, 'Lunch')).toContainText(PULAO.name);
  await expect(slot(page, 'Lunch')).toContainText(DAAL.name);
  await expect(slot(page, 'Lunch').getByRole('status', { name: 'People eating Lunch' })).toHaveText(String(SERVINGS + 1));
});

test('cooking from the plan prefills the flow, marks the item cooked, empties the planned part of the cart, and undo brings it back', async ({ page }) => {
  await start(page);
  await nav(page, 'Plan');
  await addDishTo(page, 'Lunch', KARAHI);
  await slot(page, 'Lunch').getByRole('button', { name: 'More people for Lunch' }).click();
  const servings = SERVINGS + 1;

  // Today shows the planned dish instead of a suggestion, and can switch back.
  await nav(page, 'Today');
  const hero = page.getByRole('region', { name: 'Planned next meal' });
  await expect(hero).toContainText(KARAHI.name);
  await expect(hero).toContainText('Planned');
  await expect(hero).toContainText(`For ${servings}`);
  // Eating out stays reachable from the planned card too.
  await expect(hero.getByRole('button', { name: /Eat out/ })).toBeVisible();
  await hero.getByRole('button', { name: 'Show suggestions instead' }).click();
  await expect(page.getByRole('region', { name: 'Suggested next meal' })).toBeVisible();

  const plan = [{ ...mealOf('a', 'lunch', KARAHI), servings }];
  const stock = balances(demoPantry);
  const lines = basketFromPlan(plan, seed.recipes, stock, seed.ingredients, toBase, TODAY, demoPantry);
  expect(lines.length).toBeGreaterThan(0);
  await nav(page, 'Shop');
  const plannedRows = page.locator('.shop-item').filter({ has: page.locator('.chip', { hasText: /^For / }) });
  await expect(plannedRows).toHaveCount(cartOf({ plan }).filter(l => l.reasons.plan).length);
  expect(cartOf({ plan }).filter(l => l.reasons.plan).length).toBeGreaterThanOrEqual(lines.length);

  // Cook it: servings, meal and date come from the plan.
  await nav(page, 'Plan');
  await slot(page, 'Lunch').getByRole('button', { name: `Cook ${KARAHI.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await expect(page.getByRole('button', { name: 'Lunch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Today/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'People who ate' })).toContainText(String(servings));
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${KARAHI.name}` })).toBeVisible();

  const cook = makeEvent('cook', [], new Date('2026-10-05T10:02:00+05:00'), { id: 'c1' });
  const cookedPlan = [setCooked(plan[0], 0, cook.id)];
  expect(basketFromPlan(cookedPlan, seed.recipes, stock, seed.ingredients, toBase, TODAY, [...demoPantry, cook])).toEqual([]);

  // Undo straight away from the message.
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await nav(page, 'Plan');
  await expect(slot(page, 'Lunch').getByRole('button', { name: `Cook ${KARAHI.name}`, exact: true })).toBeVisible();
  await expect(slot(page, 'Lunch')).not.toContainText('Cooked');
  await nav(page, 'Shop');
  await expect(plannedRows).toHaveCount(cartOf({ plan }).filter(l => l.reasons.plan).length);

  // Cook again and keep it: the item shows Cooked and nothing in the cart is for a planned dish.
  await nav(page, 'Plan');
  await slot(page, 'Lunch').getByRole('button', { name: `Cook ${KARAHI.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${KARAHI.name}` })).toBeVisible();
  await nav(page, 'Plan');
  await expect(slot(page, 'Lunch')).toContainText('Cooked');
  await expect(slot(page, 'Lunch').getByRole('button', { name: `Cook ${KARAHI.name}`, exact: true })).toHaveCount(0);
  await nav(page, 'Shop');
  await expect(page.getByRole('heading', { name: 'To buy' })).toBeVisible();
  await expect(plannedRows).toHaveCount(0);
  await expect(page.locator('.save-banner')).toHaveCount(0);
});

test('eating out and planned leftovers add nothing to the cart or the pantry', async ({ page }) => {
  await start(page);
  // Keep one portion-bearing leftover in the saved kitchen (the Leftovers screen arrives separately).
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('noors-kitchen'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('leftovers', 'readwrite');
      tx.objectStore('leftovers').put({
        id: 'lo1', name: 'Daal Chana', portionsMade: 3, portionsLeft: 3, madeOn: '2026-10-04', location: 'fridge',
        log: [{ at: '2026-10-04T12:00:00Z', localDate: '2026-10-04', kind: 'made', portions: 3 }],
      });
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    db.close();
  });
  await page.reload();
  const pantryBefore = await pantrySnapshot(page);

  await nav(page, 'Plan');
  // Empty state first: nothing to choose when no leftover exists is covered by the sheet text; here one exists.
  await addDishTo(page, 'Lunch', KARAHI);
  await nav(page, 'Shop');
  const plannedRows = page.locator('.shop-item').filter({ has: page.locator('.chip', { hasText: /^For / }) });
  await expect(plannedRows.first()).toBeVisible();

  // Eating out at that meal: no cooking, nothing to buy.
  await nav(page, 'Plan');
  await slot(page, 'Lunch').getByRole('button', { name: "We're eating out for Lunch" }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Kolachi <b>tonight</b>');
  await page.getByRole('dialog').getByRole('button', { name: "We're eating out", exact: true }).click();
  await expect(slot(page, 'Lunch')).toContainText('Eating out: Kolachi <b>tonight</b>'); // plain text, never markup
  await nav(page, 'Today');
  await expect(page.getByRole('region', { name: 'Planned next meal' })).toContainText('Eating out: Kolachi <b>tonight</b>');
  await nav(page, 'Shop');
  await expect(plannedRows).toHaveCount(0);

  // Leftovers for dinner: portions stepper, then "Ate it" uses the leftover, never raw stock.
  await nav(page, 'Plan');
  await slot(page, 'Dinner').getByRole('button', { name: 'Eat leftovers for Dinner' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Choose Daal Chana' }).click();
  await sheet.getByRole('button', { name: 'More portions' }).click();
  await expect(sheet.getByRole('status', { name: 'Portions to eat' })).toHaveText('2');
  await sheet.getByRole('button', { name: 'Add to this meal' }).click();
  await expect(slot(page, 'Dinner')).toContainText('Leftovers: Daal Chana · 2 portions');
  await nav(page, 'Shop');
  await expect(plannedRows).toHaveCount(0);

  await nav(page, 'Plan');
  await slot(page, 'Dinner').getByRole('button', { name: 'Ate Daal Chana', exact: true }).click();
  await expect(slot(page, 'Dinner')).toContainText('Eaten');
  expect(await pantrySnapshot(page)).toEqual(pantryBefore);

  // One portion is left, and it was saved.
  await page.reload();
  await nav(page, 'Plan');
  await slot(page, 'Dinner').getByRole('button', { name: 'Eat leftovers for Dinner' }).click();
  await expect(page.getByRole('dialog')).toContainText('1 portion left');
  await expect(page.locator('.save-banner')).toHaveCount(0);
});

test('with no leftovers the sheet says so, and suggestions are only saved when used', async ({ page }) => {
  await start(page);
  await nav(page, 'Plan');
  await slot(page, 'Dinner').getByRole('button', { name: 'Eat leftovers for Dinner' }).click();
  await expect(page.getByRole('dialog')).toContainText('No leftovers right now');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Suggest the rest of my week' }).click();
  const sheet = page.getByRole('dialog');
  const uses = sheet.getByRole('button', { name: /^Use .* for / });
  expect(await uses.count()).toBeGreaterThan(1);
  const firstName = await sheet.locator('.plan-prop').first().locator('.row__name').innerText();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  // Nothing was saved by looking.
  await expect(slot(page, 'Lunch').getByRole('button', { name: /^Remove / })).toHaveCount(0);

  await page.getByRole('button', { name: 'Suggest the rest of my week' }).click();
  await sheet.getByRole('button', { name: /^Use .* for / }).first().click();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.plan-item').filter({ hasText: firstName })).toHaveCount(1);
});
