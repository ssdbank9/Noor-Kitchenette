import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';

// Independent review, 2026-10-06 (deepseek). AR14 confirms that a second open tab silently
// deletes the first tab's saved *order cost*. The same whole-snapshot write pattern is used
// for the manual shopping list (App.tsx changeList -> db.ts saveShopping) and for settings
// (App.tsx -> db.ts saveSettings), so the same lost update applies there too. These two
// tests are the targeted regressions for those additional instances. They fail on the
// current branch and should pass once those writes stop clobbering a newer saved value.
//
// Nothing here fixes production code; the tests intentionally stay red until the fix.

async function readShopping(page: Page): Promise<{ ingredientId: string }[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const list = await new Promise<{ ingredientId: string }[]>(resolve => {
      const request = db.transaction('shopping').objectStore('shopping').get('list');
      request.onsuccess = () => resolve((request.result as { ingredientId: string }[]) ?? []);
    });
    db.close();
    return list;
  });
}

async function readSettings(page: Page): Promise<{ defaultServings: number; slotTimes: { breakfast: string } }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const settings = await new Promise<{ defaultServings: number; slotTimes: { breakfast: string } }>(resolve => {
      const request = db.transaction('meta').objectStore('meta').get('settings');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return settings;
  });
}

async function readShopPrefs(page: Page): Promise<{ dismissed: { ingredientId: string }[]; trip?: { id: string } }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const prefs = await new Promise<{ dismissed: { ingredientId: string }[]; trip?: { id: string } }>(resolve => {
      const request = db.transaction('meta').objectStore('meta').get('shopPrefs');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return prefs;
  });
}

async function addManualLine(page: Page, name: string, amount: string): Promise<void> {
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByRole('searchbox', { name: 'Search items' }).fill(name.toLowerCase());
  await page.getByRole('button', { name: `Choose ${name}`, exact: true }).click();
  await page.getByRole('dialog').getByLabel('Exact amount').fill(amount);
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('CR01: two already-open tabs keep both separately added manual cart lines', async ({ page, context }) => {
  test.setTimeout(60_000); // two tabs each driving the add-item flow is slow on a busy machine
  await page.goto('/');
  const second = await context.newPage();
  await second.goto('/');

  // Both tabs are open before either writes, so each builds its whole-list snapshot from a
  // stale in-memory copy. The second write must not erase the first tab's line.
  await addManualLine(page, 'Lemon', '4');
  await addManualLine(second, 'Tomato', '3');

  const ids = (await readShopping(page)).map(line => line.ingredientId);
  expect(ids).toContain('Lemon');
  expect(ids).toContain('Tomato');
});

test('CR02: two already-open tabs keep different settings changed in each', async ({ page, context }) => {
  await page.goto('/');
  const second = await context.newPage();
  await second.goto('/');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'More people usually eating' }).click();
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('5');
  await expect(page.locator('.save-banner')).toHaveCount(0);

  // The second tab still holds the old whole-settings object, so its write must not undo the
  // first tab's people count while saving its own breakfast-time change.
  await second.getByRole('button', { name: 'Settings', exact: true }).click();
  await second.getByRole('button', { name: 'Breakfast 15 minutes later' }).click();
  await expect(second.locator('output[aria-label="Breakfast time"]')).toHaveText('8:15 am');
  await expect(second.locator('.save-banner')).toHaveCount(0);

  const settings = await readSettings(page);
  expect(settings.defaultServings).toBe(5);
  expect(settings.slotTimes.breakfast).toBe('08:15');
});

test('CR03: two already-open tabs keep a cart snooze and a started trip (GLM N2)', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+05:00'));
  await openWithSamplePantry(page);
  // Lower Buldak so it joins the To-buy cart by itself.
  await page.getByRole('button', { name: 'Pantry', exact: true }).click();
  await page.locator('.pantry-item').filter({ has: page.locator('span', { hasText: /^Buldak noodles$/ }) }).click();
  await page.getByRole('button', { name: "Checked what's left" }).click();
  await page.getByLabel('Exact amount').fill('3');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  const second = await context.newPage();
  await second.clock.setFixedTime(new Date('2026-10-05T10:02:00+05:00'));
  await second.goto('/');

  // Tab A snoozes a cart line; tab B starts a trip, from its own stale prefs copy.
  const buldak = page.locator('.shop-item').filter({ has: page.getByRole('button', { name: 'Got it: Buldak noodles', exact: true }) });
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await buldak.getByRole('button', { name: 'More for Buldak noodles' }).click();
  await buldak.getByRole('button', { name: 'Not this week' }).click();
  await expect(page.locator('.save-banner')).toHaveCount(0);

  await second.getByRole('button', { name: 'Shop', exact: true }).click();
  await second.getByRole('button', { name: 'Start shopping' }).click();
  await expect(second.getByRole('heading', { name: 'Shopping', exact: true })).toBeVisible();
  await expect(second.locator('.save-banner')).toHaveCount(0);

  const prefs = await readShopPrefs(second);
  expect(prefs.dismissed.map(d => d.ingredientId)).toContain('Buldak_Noodles');
  expect(prefs.trip).toBeTruthy();
});
