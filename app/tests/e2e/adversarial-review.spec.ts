import { expect, test } from '@playwright/test';
import { exportBackup } from '../../src/storage/backup';
import { testKitchen } from '../../src/storage/testKitchen';
import { openWithSamplePantry } from './helpers';

test('AR07: pending settings recovered after a closed tab are shown before the next edit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('4');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const settings = await new Promise<Record<string, unknown>>(resolve => {
      const request = db.transaction('meta').objectStore('meta').get('settings');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    localStorage.setItem('noors-kitchen:pending', JSON.stringify({ version: 1, ops: [
      { type: 'settings', settings: { ...settings, defaultServings: 7 } },
    ] }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
    });
    const saved = await new Promise<{ defaultServings: number }>(resolve => {
      const request = db.transaction('meta').objectStore('meta').get('settings');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return saved.defaultServings;
  })).toBe(7);
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('7');
});

test('AR08: Today refreshes when the open app crosses midnight in Karachi', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T23:59:00+05:00') });
  await page.goto('/');
  await expect(page.locator('.today-header .eyebrow')).toContainText('5 October');
  await page.clock.fastForward(120_000);
  await expect(page.locator('.today-header .eyebrow')).toContainText('6 October');
});

test('AR02: a manual cart line does not return after restoring and reopening', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('output[aria-label="People usually eating"]')).toHaveText('4');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('noors-kitchen');
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction('shopping', 'readwrite');
    tx.objectStore('shopping').put([{ ingredientId: 'Eggs', amountBase: 6, reason: 'dish', recipeIds: [] }], 'list');
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got it: Eggs', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Backup file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(exportBackup(testKitchen())) });
  await page.getByRole('alertdialog', { name: 'Confirm restore' }).getByRole('button', { name: 'Haan', exact: true }).click();
  await expect(page.getByText('Restored. Your kitchen is now the one in the backup.')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got it: Eggs', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'To buy' })).toBeVisible();
  await page.screenshot({ path: '../audit/adversarial-2026-10-05-restored-cart.png' });
  await expect(page.getByRole('button', { name: 'Got it: Eggs', exact: true })).toHaveCount(0);
});

test('AV01: all six phone tabs fit and the undo toast stays above the bottom bar', async ({ page }) => {
  await openWithSamplePantry(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button')).toHaveCount(6);
  const bar = await nav.boundingBox();
  const toast = await page.getByRole('status').filter({ hasText: 'Sample pantry added' }).boundingBox();
  expect(bar).not.toBeNull();
  expect(toast).not.toBeNull();
  expect(toast!.y + toast!.height).toBeLessThanOrEqual(bar!.y);
  await page.screenshot({ path: '../audit/adversarial-2026-10-05-phone-toast.png' });
  for (const name of ['Plan', 'Pantry', 'Snacks', 'Shop', 'History', 'Today']) {
    const button = nav.getByRole('button', { name, exact: true });
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
