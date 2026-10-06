import { expect, test } from '@playwright/test';
import { defaultShopPrefs } from '../../src/domain/shopPrefs';

test.use({ serviceWorkers: 'block' });

test('AR16: crash between the two trip enqueues retains the purchased cart reduction', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const prefs = { ...defaultShopPrefs(), trip: { id: 'review-crash-trip', startedAt: new Date().toISOString(), got: { Eggs: 3 } } };
  await page.evaluate(async prefs => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('noors-kitchen'); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction(['meta', 'shopping'], 'readwrite');
    tx.objectStore('meta').put(prefs, 'shopPrefs');
    tx.objectStore('shopping').put([{ ingredientId:'Eggs', amountBase:6, reason:'dish', recipeIds:[] }], 'list');
    await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
    db.close();
  }, prefs);
  await page.reload();
  await page.getByRole('button', { name:'Shop', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Shopping', exact:true })).toBeVisible();
  await page.getByRole('button', { name:'Done shopping', exact:true }).click();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await page.evaluate(() => {
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      nativeSet.call(this, key, value);
      if (key === 'noors-kitchen:pending' && JSON.parse(value).ops.some((op: any) => op.type === 'tripDone')) {
        // Stop immediately after the first operation is durably mirrored, before the
        // second enqueue runs. This is the exact crash boundary under review.
        debugger;
      }
    };
  });
  const paused = new Promise<void>(resolve => client.once('Debugger.paused', () => resolve()));
  const crashed = page.waitForEvent('crash');
  const click = page.getByRole('button', { name:'Save purchase', exact:true }).click().catch(() => {});
  await paused;
  void client.send('Page.crash').catch(() => {});
  await crashed;
  await click;
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByRole('heading', { name:'Assalam-o-alaikum, Noor' })).toBeVisible();
  await expect.poll(() => reopened.evaluate(() => localStorage.getItem('noors-kitchen:pending'))).toBeNull();
  const saved = await reopened.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r=indexedDB.open('noors-kitchen'); r.onsuccess=()=>resolve(r.result); });
    const tx=db.transaction(['events','meta','shopping']);
    const read = (r: IDBRequest) => new Promise<any>(resolve => { r.onsuccess=()=>resolve(r.result); });
    const [events,prefs,list]=await Promise.all([read(tx.objectStore('events').getAll()),read(tx.objectStore('meta').get('shopPrefs')),read(tx.objectStore('shopping').get('list'))]);
    db.close(); return {events,prefs,list};
  });
  expect(saved.events.filter((e: any) => e.id === 'trip-review-crash-trip')).toHaveLength(1);
  expect(saved.events.find((e: any) => e.id === 'trip-review-crash-trip').movements[0].delta).toBe(3);
  expect(saved.prefs.trip).toBeUndefined();
  expect(saved.list.find((line: any) => line.ingredientId === 'Eggs').amountBase).toBe(3);
});
