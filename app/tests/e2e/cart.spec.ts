import { formatAmount } from '../../src/lib/formatAmount';
import { expect, test, type Page } from '@playwright/test';
import { demoPantry } from '../../src/data/demoPantry';
import { seed } from '../../src/data/seed';
import { balances } from '../../src/domain/ledger';
import { cartOf, cartRow } from './cartKit';
import { openWithSamplePantry } from './helpers';

// The To-buy cart and shopping trip (D-22). Dates come from a fixed clock, never the real one:
// Monday 5 October 2026, 10:00 in Karachi.
const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const BULDAK = byId.get('Buldak_Noodles')!;
const fmt = formatAmount;
const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const pantryRow = (page: Page, name: string) =>
  page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });

async function start(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+05:00'));
  await openWithSamplePantry(page);
  // A fixed clock never moves, so move it a minute on: later entries are recorded after the sample stock.
  await page.clock.setFixedTime(new Date('2026-10-05T10:01:00+05:00'));
}

// Under a fixed clock every entry would share one instant and stock checks could sort in any order,
// so each check moves the (still fixed) clock one minute on.
const minutes = new WeakMap<Page, number>();

/** Pantry: open an item and say how much is left ("Checked what's left"). */
async function checkLeft(page: Page, name: string, amount: string) {
  const n = (minutes.get(page) ?? 1) + 1;
  minutes.set(page, n);
  await page.clock.setFixedTime(new Date(`2026-10-05T10:${String(n).padStart(2, '0')}:00+05:00`));
  await nav(page, 'Pantry');
  await pantryRow(page, name).click();
  await page.getByRole('button', { name: "Checked what's left" }).click();
  await page.getByLabel('Exact amount').fill(amount);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(pantryRow(page, name)).toContainText(amount);
}

const buldakRow = (page: Page) => cartRow(page, 'Buldak noodles');
const toBuy = (page: Page) => page.getByRole('heading', { name: 'To buy' });

test('Buldak noodles join the cart by themselves below 5 packs, and leave at 5', async ({ page }) => {
  await start(page);
  await checkLeft(page, 'Buldak noodles', '3');
  await nav(page, 'Shop');
  await expect(toBuy(page)).toBeVisible();
  await expect(buldakRow(page)).toContainText(fmt(5, BULDAK)); // the usual buy: 5 packs
  await expect(buldakRow(page).getByRole('list', { name: 'Why Buldak noodles is here' })).toContainText('Low');
  await expect(buldakRow(page).getByRole('list', { name: 'Why Buldak noodles is here' })).toContainText('Always keep');
  const count = cartOf({ events: demoPantry }).length; // the header counts every line
  await expect(page.getByText(/things? to buy/).first()).toBeVisible();
  expect(count).toBeGreaterThan(0);

  await checkLeft(page, 'Buldak noodles', '5');
  await nav(page, 'Shop');
  await expect(buldakRow(page)).toHaveCount(0);

  await checkLeft(page, 'Buldak noodles', '4');
  await nav(page, 'Shop');
  await expect(buldakRow(page)).toContainText(fmt(5, BULDAK));
});

test('"Not this week" hides a low item, it stays hidden after a reload and returns after a week', async ({ page }) => {
  await start(page);
  await checkLeft(page, 'Buldak noodles', '3');
  await nav(page, 'Shop');
  await buldakRow(page).getByRole('button', { name: 'More for Buldak noodles' }).click();
  await buldakRow(page).getByRole('button', { name: 'Not this week' }).click();
  await expect(buldakRow(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Buldak noodles is off the list for a week');

  await page.reload();
  await nav(page, 'Shop');
  await expect(toBuy(page)).toBeVisible();
  await expect(buldakRow(page)).toHaveCount(0);

  // Eight days later it is back (the clock stays fixed, just later).
  await page.clock.setFixedTime(new Date('2026-10-13T10:00:00+05:00'));
  await page.reload();
  await nav(page, 'Shop');
  await expect(buldakRow(page)).toContainText(fmt(5, BULDAK));
});

test('"Remove" hides a low item until its stock is lowered again', async ({ page }) => {
  await start(page);
  await checkLeft(page, 'Buldak noodles', '3');
  await nav(page, 'Shop');
  await buldakRow(page).getByRole('button', { name: 'More for Buldak noodles' }).click();
  await buldakRow(page).getByRole('button', { name: 'Remove' }).click();
  await expect(buldakRow(page)).toHaveCount(0);

  await checkLeft(page, 'Buldak noodles', '4'); // more than when removed: still hidden
  await nav(page, 'Shop');
  await expect(toBuy(page)).toBeVisible();
  await expect(buldakRow(page)).toHaveCount(0);

  await checkLeft(page, 'Buldak noodles', '2'); // lower than when removed: back
  await nav(page, 'Shop');
  await expect(buldakRow(page)).toContainText(fmt(5, BULDAK));
});

test('Always keep... sets the minimum and the usual buy amount, and it survives a reload', async ({ page }) => {
  await start(page);
  await nav(page, 'Shop');
  await buldakRow(page).getByRole('button', { name: 'More for Buldak noodles' }).click();
  await buldakRow(page).getByRole('button', { name: 'Always keep...' }).click();
  const sheet = page.getByRole('dialog', { name: 'Always keep Buldak noodles' });
  await sheet.getByRole('group', { name: 'Keep at least' }).getByLabel('Exact amount').fill('8');
  await sheet.getByRole('group', { name: 'Usually buy' }).getByLabel('Exact amount').fill('10');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Always keeping Buldak noodles');
  await expect(buldakRow(page)).toContainText(fmt(10, BULDAK));

  await page.reload();
  await nav(page, 'Shop');
  await expect(buldakRow(page)).toContainText(fmt(10, BULDAK));
});

test('+ Add item: search keeps focus, a chosen item and a new item become manual lines, saved across a reload', async ({ page }) => {
  await start(page);
  await nav(page, 'Shop');
  await page.getByRole('button', { name: '+ Add item' }).click();
  const search = page.getByRole('searchbox', { name: 'Search items' });
  await expect(search).toBeFocused();
  await page.keyboard.type('lemon', { delay: 40 });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('lemon');
  await page.getByRole('button', { name: 'Choose Lemon', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Exact amount').fill('4');
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cartRow(page, 'Lemon')).toContainText('Added');
  await expect(cartRow(page, 'Lemon')).toContainText(/4\b/);

  // A brand new item, with its own unit and aisle.
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByRole('searchbox', { name: 'Search items' }).click();
  await page.keyboard.type('Mango pickle', { delay: 30 });
  await expect(page.getByRole('searchbox', { name: 'Search items' })).toBeFocused();
  await page.getByRole('button', { name: 'Add "Mango pickle" as a new item' }).click();
  await page.getByRole('group', { name: 'How it is counted' }).getByRole('button', { name: 'pieces' }).click();
  await page.getByRole('group', { name: 'Aisle' }).getByRole('button', { name: 'Snacks & noodles' }).click();
  await page.getByRole('dialog').getByLabel('Exact amount').fill('2');
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(cartRow(page, 'Mango pickle')).toContainText('2 pc');
  await expect(page.getByRole('region', { name: 'Snacks & noodles' })).toContainText('Mango pickle');

  await page.reload();
  await nav(page, 'Shop');
  await expect(cartRow(page, 'Mango pickle')).toContainText('2 pc');
  await expect(cartRow(page, 'Lemon')).toContainText('Added');
  // A manual line also shows in the Pantry as a new, empty item.
  await nav(page, 'Pantry');
  await expect(pantryRow(page, 'Mango pickle')).toBeVisible();
});

test('+ Add item: browse the Snacks & noodles aisle and add Buldak without typing', async ({ page }) => {
  await start(page);
  await nav(page, 'Shop');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByRole('group', { name: 'Browse by aisle' }).getByRole('button', { name: 'Snacks & noodles' }).click();
  await page.getByRole('button', { name: 'Choose Buldak noodles', exact: true }).click();
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(cartRow(page, 'Buldak noodles')).toBeVisible();
});

test('Store grouping puts lines under "Any store" by default, and Share list copies the whole cart', async ({ page }) => {
  await start(page);
  await nav(page, 'Shop');
  await page.getByRole('button', { name: 'Store', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Any store' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Any store' }).locator('.shop-item').first()).toBeVisible();
  await page.getByRole('button', { name: 'Aisle', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Snacks & noodles' })).toContainText('Buldak noodles');
  await page.evaluate(() => { (navigator as unknown as { share?: unknown }).share = undefined; });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share list', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Shopping list copied.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Shopping list');
  expect(text).toContain('Snacks & noodles');
  expect(text).toContain(`- Buldak noodles ${fmt(5, BULDAK)}`);
});

test('Today shows a small "things to buy" chip that opens the Shop tab', async ({ page }) => {
  await start(page);
  const n = cartOf({ events: demoPantry }).length;
  const chip = page.getByRole('button', { name: `${n} ${n === 1 ? 'thing' : 'things'} to buy` });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(toBuy(page)).toBeVisible();
});

test.describe('shopping trip', () => {
  async function startTrip(page: Page) {
    await nav(page, 'Shop');
    await page.getByRole('button', { name: 'Start shopping' }).click();
    await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
  }
  const line = (page: Page, name: string) => page.locator('.trip-line').filter({ hasText: name });

  test('pick items, record less for one, Done shopping updates the Pantry once, and a double tap changes stock once', async ({ page }) => {
    await start(page);
    const cart = cartOf({ events: demoPantry });
    await startTrip(page);
    await expect(page.getByRole('status', { name: 'Trip progress' })).toHaveText(`0 of ${cart.length}`);
    await expect(page.getByRole('button', { name: 'Done shopping' })).toBeDisabled();

    // Buldak: tap picks all 5, the stepper records less (Got 3 of 5).
    await line(page, 'Buldak noodles').getByRole('button', { name: /^Buldak noodles, / }).click();
    await expect(page.getByRole('status', { name: 'Trip progress' })).toHaveText(`1 of ${cart.length}`);
    await line(page, 'Buldak noodles').getByRole('button', { name: 'Less Buldak noodles' }).click();
    await line(page, 'Buldak noodles').getByRole('button', { name: 'Less Buldak noodles' }).click();
    await expect(line(page, 'Buldak noodles')).toContainText(`Got ${fmt(3, BULDAK)} of ${fmt(5, BULDAK)}`);
    await expect(page.getByRole('status', { name: 'Trip progress' })).toHaveText(`0 of ${cart.length}`); // not complete

    // A second item picked in full.
    const other = cart.find(l => l.ingredientId !== 'Buldak_Noodles' && l.amountBase !== null)!;
    const otherIng = byId.get(other.ingredientId)!;
    await line(page, otherIng.name).first().getByRole('button', { name: new RegExp(`^${otherIng.name.replace(/[()]/g, '\\$&')}, `) }).click();
    await expect(page.getByRole('status', { name: 'Trip progress' })).toHaveText(`1 of ${cart.length}`);

    // Done shopping: summary, optional total, ONE purchase.
    await page.getByRole('button', { name: 'Done shopping' }).click();
    await expect(page.getByRole('list', { name: 'What you picked up' })).toContainText('Buldak noodles');
    await page.getByLabel('Total spent in Rs (optional)').fill('12x');
    await page.getByRole('button', { name: 'Save purchase' }).click();
    await expect(page.getByRole('alert')).toContainText('Total spent must be a number');
    await page.getByLabel('Total spent in Rs (optional)').fill('3200');
    // Two taps as fast as possible: the second one must not add the stock again.
    await page.getByRole('button', { name: 'Save purchase' }).evaluate((b: HTMLElement) => { b.click(); b.click(); });
    await expect(page.getByRole('status')).toContainText('Saved your shopping');
    await expect(page.getByRole('button', { name: 'Start shopping' })).toBeVisible();
    // The unpicked lines stay in the cart; the partly picked Buldak stays with what is still short.
    await expect(page.locator('.shop-item').first()).toBeVisible();

    await nav(page, 'Pantry');
    await expect(pantryRow(page, 'Buldak noodles')).toContainText(fmt(3, BULDAK));
    await expect(pantryRow(page, otherIng.name)).toContainText(fmt((balances(demoPantry).get(otherIng.id)?.amount ?? 0) + other.amountBase!, otherIng));

    // Exactly one purchase event for the trip, with the typed total, and it survives a reload.
    await page.reload();
    const events = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('noors-kitchen'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const all: { id: string; priceRs?: number; movements: unknown[] }[] = await new Promise((res, rej) => {
        const r = db.transaction('events').objectStore('events').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      db.close();
      return all.filter(e => e.id.startsWith('trip-'));
    });
    expect(events).toHaveLength(1);
    expect(events[0].priceRs).toBe(3200);
    expect(events[0].movements).toHaveLength(2);
    await nav(page, 'Pantry');
    await expect(pantryRow(page, 'Buldak noodles')).toContainText(fmt(3, BULDAK));
  });

  test('a reload in the middle of a trip keeps the ticks; Cancel trip asks first and leaves the Pantry alone', async ({ page }) => {
    await start(page);
    await startTrip(page);
    await line(page, 'Buldak noodles').getByRole('button', { name: /^Buldak noodles, / }).click();
    await expect(line(page, 'Buldak noodles').getByRole('button', { name: /^Buldak noodles, / })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.save-banner')).toHaveCount(0);

    await page.reload();
    await nav(page, 'Shop');
    await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
    await expect(line(page, 'Buldak noodles').getByRole('button', { name: /^Buldak noodles, / })).toHaveAttribute('aria-pressed', 'true');

    // Cancel: YES/NO. NO keeps the trip, YES ends it without buying anything.
    await page.getByRole('button', { name: 'Cancel trip' }).click();
    await page.getByRole('group', { name: 'Cancel trip?' }).getByRole('button', { name: 'Nahi', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel trip' }).click();
    await page.getByRole('group', { name: 'Cancel trip?' }).getByRole('button', { name: 'Haan', exact: true }).click();
    await expect(toBuy(page)).toBeVisible();
    await expect(buldakRow(page)).toContainText(fmt(5, BULDAK));
    await nav(page, 'Pantry');
    await expect(pantryRow(page, 'Buldak noodles')).toContainText('none');
  });

  test('the trip works with no network: pick, Done shopping, Pantry updated', async ({ page, context }) => {
    await start(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await startTrip(page);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await nav(page, 'Shop');
    await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
    await line(page, 'Buldak noodles').getByRole('button', { name: /^Buldak noodles, / }).click();
    await page.getByRole('button', { name: 'Done shopping' }).click();
    await page.getByRole('button', { name: 'Save purchase' }).click();
    await expect(page.getByRole('status')).toContainText('Saved your shopping');
    await expect(page.locator('.save-banner')).toHaveCount(0);
    await nav(page, 'Pantry');
    await expect(pantryRow(page, 'Buldak noodles')).toContainText(fmt(5, BULDAK));

    await context.setOffline(false);
  });
});
