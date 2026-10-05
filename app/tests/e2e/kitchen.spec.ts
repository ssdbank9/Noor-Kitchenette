import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// F65 to F68, F76. The clock is fixed so dates never depend on the real day: 5 October 2026, 10:00 in Karachi.
const NOW = new Date('2026-10-05T10:00:00+05:00');

async function start(page: Page) {
  await page.clock.setFixedTime(NOW);
  await openWithSamplePantry(page);
}

const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const view = (page: Page, name: string) => page.getByRole('group', { name: 'Pantry views' }).getByRole('button', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });

async function pantryAmounts(page: Page): Promise<string[]> {
  await nav(page, 'Pantry');
  await view(page, 'Items');
  // Sorted: the list order differs between a fresh start and a reload (ids come back sorted).
  return (await page.locator('.pantry-item__amount').allInnerTexts()).sort();
}

/** Cooks the suggested dish with `left` portions left over and returns the dish name. */
async function cookWithLeftover(page: Page, left: number): Promise<string> {
  await page.getByRole('button', { name: /let's cook/ }).click();
  const name = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  await page.getByRole('button', { name: 'I cooked this' }).click();
  for (let i = 0; i < left; i++) await page.getByRole('button', { name: 'More portions left' }).click();
  await page.getByRole('button', { name: 'Haan', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText(`Saved ${name}`);
  return name;
}

const card = (page: Page, name: string) => page.locator('.depth-card', { has: page.getByRole('heading', { name, exact: true }) });

test('cooking with 2 portions left over keeps them in Pantry > Leftovers and survives a reload', async ({ page }) => {
  await start(page);
  const name = await cookWithLeftover(page, 2);
  await nav(page, 'Pantry');
  await view(page, 'Leftovers');
  await expect(card(page, name)).toHaveCount(1);
  await expect(card(page, name)).toContainText('2 left');
  await expect(card(page, name)).toContainText('Made 5 Oct');
  await expect(card(page, name)).toContainText('Use by 8 Oct (a guide)');
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await page.reload();
  await nav(page, 'Pantry');
  await view(page, 'Leftovers');
  await expect(card(page, name)).toHaveCount(1);
  await expect(card(page, name)).toContainText('2 left');
});

test('the leftover id comes from the cook event, so a retried save cannot add a second one', async ({ page }) => {
  await start(page);
  const name = await cookWithLeftover(page, 2);
  await expect(page.locator('.save-banner')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('noors-kitchen'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (store: string) => new Promise<any[]>((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const cook = (await all('events')).find(e => e.kind === 'cook');
    const [lo] = await all('leftovers');
    // Replay the very same write, as the save queue does on a retry.
    await new Promise<void>((res, rej) => { const tx = db.transaction('leftovers', 'readwrite'); tx.objectStore('leftovers').put(lo); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    const after = await all('leftovers');
    return { cookId: cook.id, id: lo.id, from: lo.fromEventId, name: lo.name, count: after.length };
  });
  expect(result).toMatchObject({ id: `lo-${result.cookId}`, from: result.cookId, name, count: 1 });
});

test('Ate some lowers portions but leaves Pantry amounts alone; Freeze it moves it; Threw away shows only under Thrown away', async ({ page }) => {
  await start(page);
  const name = await cookWithLeftover(page, 2);
  const amountsBefore = await pantryAmounts(page);

  await view(page, 'Leftovers');
  await card(page, name).getByRole('button', { name: 'Ate some', exact: true }).click();
  await card(page, name).getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(card(page, name)).toContainText('1 left');
  expect(await pantryAmounts(page)).toEqual(amountsBefore);

  await view(page, 'Leftovers');
  await card(page, name).getByRole('button', { name: 'Freeze it', exact: true }).click();
  await expect(card(page, name).getByRole('button', { name: 'Freezer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, name)).toContainText('Use by 3 Jan (a guide)');
  await expect(card(page, name).getByRole('button', { name: 'Freeze it' })).toHaveCount(0);

  await page.reload();
  await nav(page, 'Pantry');
  await view(page, 'Leftovers');
  await expect(card(page, name)).toHaveCount(1);
  await expect(card(page, name).getByRole('button', { name: 'Freezer', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await card(page, name).getByRole('button', { name: 'Threw away', exact: true }).click();
  await card(page, name).getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(card(page, name)).toHaveCount(0);
  expect(await pantryAmounts(page)).toEqual(amountsBefore);

  await view(page, 'Waste');
  const thrown = page.getByRole('region', { name: 'Thrown away' });
  await expect(thrown).toContainText(name);
  await expect(thrown).toContainText('1 portion');
  await expect(page.getByRole('region', { name: 'Used up' })).not.toContainText(name);
  await expect(page.getByRole('region', { name: 'Corrections' })).not.toContainText(name);
  await expect(page.getByRole('region', { name: 'Corrections' })).toContainText('0 checks');

  await page.reload();
  await nav(page, 'Pantry');
  await view(page, 'Waste');
  await expect(page.getByRole('region', { name: 'Thrown away' })).toContainText(name);
});

test('Ate some can be undone from the message', async ({ page }) => {
  await start(page);
  const name = await cookWithLeftover(page, 2);
  await nav(page, 'Pantry');
  await view(page, 'Leftovers');
  await card(page, name).getByRole('button', { name: 'Ate some', exact: true }).click();
  await card(page, name).getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(card(page, name)).toContainText('1 left');
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, name)).toContainText('2 left');
});

test('an ingredient thrown away shows under Thrown away, with Undo, and a stock check shows under Corrections', async ({ page }) => {
  await start(page);
  await nav(page, 'Pantry');
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Threw away' }).click();
  await page.getByRole('button', { name: '1 pc', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: "Checked what's left" }).click();
  await page.getByLabel('Exact amount').fill('3');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await view(page, 'Waste');
  await expect(page.getByRole('region', { name: 'Thrown away' })).toContainText('Tomato');
  await expect(page.getByRole('region', { name: 'Used up' })).not.toContainText('Tomato');
  await expect(page.getByRole('region', { name: 'Corrections' })).toContainText('1 check');
  await expect(page.getByRole('region', { name: 'Corrections' })).toContainText('Set to 3 pc');
  await page.getByRole('button', { name: 'Undo thrown away Tomato' }).click();
  await expect(page.getByRole('region', { name: 'Thrown away' })).not.toContainText('Tomato');
});

test('a batch expiring tomorrow shows under Use soon and on Today, and survives a reload', async ({ page }) => {
  await start(page);
  await nav(page, 'Pantry');
  const before = (await row(page, 'Tomato').locator('.pantry-item__amount').innerText()).trim();
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Where and when' }).click();
  await page.getByRole('button', { name: 'Add a batch' }).click();
  await page.getByLabel('Amount in this batch').fill('2');
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await page.getByLabel('Package size').fill('6');
  await page.getByRole('button', { name: 'Save batch' }).click();
  await expect(page.getByRole('dialog').getByRole('listitem', { name: 'Tomato batch' })).toContainText('Expires 6 Oct');
  await expect(page.getByRole('dialog').getByRole('listitem', { name: 'Tomato batch' })).toContainText('Package 6 pc');
  await page.locator('.psheet__close').click();

  // The amount is untouched, and the place now shows next to it.
  await expect(row(page, 'Tomato').locator('.pantry-item__amount')).toContainText(before.replace(/ ·.*$/, ''));
  await expect(row(page, 'Tomato').locator('.pantry-item__amount')).toContainText('Fridge');

  await view(page, 'Use soon');
  const list = page.getByRole('region', { name: 'Use soon' });
  await expect(list).toContainText('Tomato');
  await expect(list).toContainText('Expires tomorrow');
  await expect(list).toContainText('Probably still here');

  await nav(page, 'Today');
  const chips = page.getByRole('region', { name: 'Use soon' });
  await expect(chips.getByRole('button', { name: 'Tomato' })).toBeVisible();

  await page.reload();
  await nav(page, 'Today');
  await expect(page.getByRole('region', { name: 'Use soon' }).getByRole('button', { name: 'Tomato' })).toBeVisible();
  await page.getByRole('region', { name: 'Use soon' }).getByRole('button', { name: 'Tomato' }).click();
  await expect(page.getByRole('region', { name: 'Use soon' })).toContainText('Expires tomorrow');
});

test('Bought more can add a place and date, linked to that purchase, and Undo takes both away', async ({ page }) => {
  await start(page);
  await nav(page, 'Pantry');
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Bought more' }).click();
  await page.getByRole('button', { name: '6 pc', exact: true }).click();
  await page.getByRole('button', { name: 'Add place and date' }).click();
  await page.getByRole('button', { name: 'Freezer', exact: true }).click();
  await page.getByRole('button', { name: 'In a week', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row(page, 'Tomato').locator('.pantry-item__amount')).toContainText('Freezer');

  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Tomato').locator('.pantry-item__amount')).not.toContainText('Freezer');
});

test('Bought more without a place is exactly as before: no batch, no place', async ({ page }) => {
  await start(page);
  await nav(page, 'Pantry');
  await row(page, 'Tomato').click();
  await page.getByRole('button', { name: 'Bought more' }).click();
  await page.getByRole('button', { name: '6 pc', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row(page, 'Tomato').locator('.pantry-item__amount')).not.toContainText(/Fridge|Freezer|Shelf/);
  await view(page, 'Use soon');
  await expect(page.getByText('Nothing needs using up soon.')).toBeVisible();
});

test('a leftover can be added by hand', async ({ page }) => {
  await start(page);
  await nav(page, 'Pantry');
  await view(page, 'Leftovers');
  await expect(page.getByText('No leftovers right now.')).toBeVisible();
  await page.getByRole('button', { name: 'Add leftover', exact: true }).click();
  await page.getByLabel('What is it?').fill('Chicken biryani');
  await page.getByRole('button', { name: 'Save leftover' }).click();
  await expect(card(page, 'Chicken biryani')).toContainText('2 left');
});
