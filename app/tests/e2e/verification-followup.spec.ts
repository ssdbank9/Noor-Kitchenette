import { expect, test, type Page } from '@playwright/test';
import { openWithSamplePantry } from './helpers';
import { forceNativeAbort, releaseNativeAbort } from './failureKit';

test.use({ serviceWorkers: 'block' });

async function readMeta(page: Page, key: string) {
  return page.evaluate(async key => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
    });
    const value = await new Promise<any>(resolve => {
      const request = db.transaction('meta').objectStore('meta').get(key);
      request.onsuccess = () => resolve(request.result);
    });
    db.close(); return value;
  }, key);
}

test('VF01: native IndexedDB transaction abort keeps the setting queued and Retry saves it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await forceNativeAbort(page);
  await page.getByRole('button', { name: 'More people usually eating' }).click();
  await expect(page.locator('.save-banner')).toContainText('Not saved yet');
  await expect.poll(() => page.evaluate(() => (window as any).reviewNativeAborted)).toBe(true);
  expect((await readMeta(page, 'settings')).defaultServings).toBe(4);
  const mirror = await page.evaluate(() => JSON.parse(localStorage.getItem('noors-kitchen:pending')!));
  // The app saves a settings change as a small patch now (A1); accept either op shape.
  const lastOp = mirror.ops.at(-1);
  expect(lastOp.settings?.defaultServings ?? lastOp.patch?.defaultServings).toBe(5);
  await releaseNativeAbort(page);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.save-banner')).toHaveCount(0);
  expect((await readMeta(page, 'settings')).defaultServings).toBe(5);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('5');
});

test('AR14: two already-open tabs retain both separately logged order costs', async ({ page, context }) => {
  await openWithSamplePantry(page);
  await page.getByRole('button', { name: /Not in the mood to cook/ }).click();
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: /Not in the mood to cook/ }).click();
  for (const [target, restaurant, amount] of [[page, 'Review first order', '2401'], [second, 'Review second order', '1200']] as const) {
    await target.getByRole('button', { name: 'Log an order' }).click();
    await target.getByLabel('Restaurant').fill(restaurant);
    await target.getByLabel('What it cost (Rs)').fill(amount);
    await target.getByRole('button', { name: 'Save order' }).click();
    await expect(target.getByRole('article', { name: `Order ${restaurant}` })).toBeVisible();
    await expect.poll(async () => (await readMeta(target, 'orderCosts')).some((o: any) => o.place === restaurant)).toBe(true);
  }
  const saved = await readMeta(second, 'orderCosts');
  expect(saved.map((o: any) => o.place).sort()).toEqual(['Review first order', 'Review second order']);
});

test('AR15: failed IndexedDB and exhausted localStorage warn that closing will lose the change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const full = await page.evaluate(() => {
    let n = 0;
    try { for (;;) localStorage.setItem(`review-fill-${n++}`, 'x'.repeat(1024)); }
    catch (error) {
      // The failed 1 KB chunk can leave enough room for the small pending settings blob.
      // Fill that tail one character at a time before asserting mirror failure.
      let tail = 1;
      try { for (;;) localStorage.setItem('review-tail', 'x'.repeat(tail++)); } catch {}
      return (error as DOMException).name;
    }
  });
  expect(full).toBe('QuotaExceededError');
  await forceNativeAbort(page);
  await page.getByRole('button', { name: 'More people usually eating' }).click();
  await expect(page.locator('.save-banner')).toContainText('Not saved yet');
  // The banner can show from the mirror error before the native write aborts; wait for the
  // abort itself, then confirm nothing was saved.
  await expect.poll(() => page.evaluate(() => (window as any).reviewNativeAborted)).toBe(true);
  expect((await readMeta(page, 'settings')).defaultServings).toBe(4);
  expect(await page.evaluate(() => localStorage.getItem('noors-kitchen:pending'))).toBeNull();
  // Both durable copies are unavailable: the UI must explain that closing discards it.
  const warning = await page.getByRole('alert').innerText();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('4');
  expect(warning).toMatch(/clos|reload|lost/i);
});

test('VF03: a real renderer crash retains the pending setting and replays it into IndexedDB', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await forceNativeAbort(page);
  await page.getByRole('button', { name: 'More people usually eating' }).click();
  await expect(page.locator('.save-banner')).toBeVisible();
  expect(await page.evaluate(() => !!localStorage.getItem('noors-kitchen:pending'))).toBe(true);
  const client = await context.newCDPSession(page);
  const crashed = page.waitForEvent('crash');
  void client.send('Page.crash').catch(() => {});
  await crashed;
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByRole('heading', { name: 'Assalam-o-alaikum, Noor' })).toBeVisible();
  await expect.poll(async () => (await readMeta(reopened, 'settings')).defaultServings).toBe(5);
  await expect.poll(() => reopened.evaluate(() => localStorage.getItem('noors-kitchen:pending'))).toBeNull();
  // AR07 separately tests that the UI must also reflect the recovered setting.
});

test('VF04: clearing a setting survives the localStorage mirror and a reload (GLM N1)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Gemini key' }).fill('AIzaFAKE-test-key-000000000000');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('Key saved on this phone.')).toBeVisible();
  // Now the IndexedDB write fails, so the ONLY durable copy is the localStorage mirror.
  await forceNativeAbort(page);
  await page.getByRole('button', { name: 'Remove key' }).click();
  await expect(page.locator('.save-banner')).toContainText('Not saved yet');
  const lastOp = await page.evaluate(() => JSON.parse(localStorage.getItem('noors-kitchen:pending')!).ops.at(-1));
  expect(lastOp.type).toBe('settingsPatch');
  expect(lastOp.remove).toContain('geminiKey'); // a JSON-safe removal, not a dropped undefined
  // Reload: boot must replay the clear and write it, not resurrect the key.
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect((await readMeta(page, 'settings')).geminiKey).toBeUndefined();
  await expect(page.getByText('Key saved on this phone.')).toHaveCount(0);
});
