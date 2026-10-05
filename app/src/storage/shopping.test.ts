import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShoppingList } from '../domain/shopping';
import type { KitchenEvent } from '../domain/types';
import { kitchenWriter, loadKitchen, loadShopping, openKitchenDb, replaceAll, saveShopping, savePurchase, type KitchenDb, type KitchenWrite } from './db';
import { createSaveQueue } from './saveQueue';
import { testKitchen } from './testKitchen';

let opened: KitchenDb[] = [];
let n = 0;
async function freshDb(): Promise<KitchenDb> {
  const db = await openKitchenDb(`shop-test-${++n}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  for (const db of opened) db.close();
  opened = [];
});

const list: ShoppingList = [
  { ingredientId: 'Eggs', amountBase: 6, reason: 'dish', recipeIds: ['R002'] },
  { ingredientId: 'Masoor_Daal', amountBase: null, reason: 'low-stock', recipeIds: [] },
];
const bought: KitchenEvent = {
  id: 'p1', kind: 'purchase', at: '2026-10-04T10:00:00.000Z', localDate: '2026-10-04', localTime: '15:00',
  timeZone: 'Asia/Karachi', movements: [{ ingredientId: 'Eggs', delta: 6, basis: 'measured' }], source: 'typed',
};

describe('saved shopping list', () => {
  it('is empty before anything is saved', async () => {
    expect(await loadShopping(await freshDb())).toEqual([]);
  });

  it('round trips, and survives closing and reopening', async () => {
    const name = `shop-reopen-${++n}`;
    const first = await openKitchenDb(name);
    await replaceAll(first, testKitchen());
    await saveShopping(first, list);
    first.close();
    const second = await openKitchenDb(name);
    opened.push(second);
    expect(await loadShopping(second)).toEqual(list);
  });

  it('is refused before the kitchen is set up', async () => {
    await expect(saveShopping(await freshDb(), list)).rejects.toThrow('not been set up');
  });

  it('is left alone by replaceAll', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    await saveShopping(db, list);
    await replaceAll(db, testKitchen());
    expect(await loadShopping(db)).toEqual(list);
  });

  it('upgrading a version 1 database keeps its data and adds the shopping store', async () => {
    const name = `shop-upgrade-${++n}`;
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        for (const s of ['ingredients', 'recipes', 'events']) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('meta');
      },
    });
    const k = testKitchen();
    for (const i of k.ingredients) await v1.put('ingredients', i);
    for (const r of k.recipes) await v1.put('recipes', r);
    for (const e of k.events) await v1.put('events', e);
    await v1.put('meta', k.settings, 'settings');
    await v1.put('meta', k.schemaVersion, 'schemaVersion');
    v1.close();

    const db = await openKitchenDb(name);
    opened.push(db);
    expect(await loadKitchen(db)).toEqual(k);
    expect(await loadShopping(db)).toEqual([]);
    await saveShopping(db, list);
    expect(await loadShopping(db)).toEqual(list);
  });
});

describe('purchase from the shopping list', () => {
  it('saves the event and the shorter list together', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    await saveShopping(db, list);
    await savePurchase(db, bought, [list[1]]);
    expect((await loadKitchen(db))!.events.map(e => e.id)).toContain('p1');
    expect(await loadShopping(db)).toEqual([list[1]]);
  });

  it('is all-or-nothing: a failed purchase changes neither the events nor the list', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    await saveShopping(db, list);
    await expect(savePurchase(db, { ...bought, id: undefined as unknown as string }, [])).rejects.toThrow();
    expect((await loadKitchen(db))!.events.map(e => e.id)).not.toContain('p1');
    expect(await loadShopping(db)).toEqual(list);
  });

  it('replaying the same purchase (retry after a reload) never applies it twice', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    await saveShopping(db, list);
    const write = kitchenWriter(db);
    const op: KitchenWrite = { type: 'purchase', event: bought, list: [list[1]] };
    await write(op);
    await write(op);
    const events = (await loadKitchen(db))!.events.filter(e => e.id === 'p1');
    expect(events).toHaveLength(1);
    expect(await loadShopping(db)).toEqual([list[1]]);
  });

  it('through the save queue: a failure keeps one pending op, retry saves both parts', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    await saveShopping(db, list);
    const real = kitchenWriter(db);
    let fail = true;
    const queue = createSaveQueue(async (op: Parameters<typeof real>[0]) => {
      if (fail) throw new Error('disk full');
      await real(op);
    }, { storage: null });
    await queue.enqueue({ type: 'purchase', event: bought, list: [list[1]] });
    expect(queue.getState().status).toBe('error');
    expect(queue.getPending()).toHaveLength(1);
    expect(await loadShopping(db)).toEqual(list);
    fail = false;
    await queue.retry();
    expect(queue.getState().pending).toBe(0);
    expect(await loadShopping(db)).toEqual([list[1]]);
    expect((await loadKitchen(db))!.events.filter(e => e.id === 'p1')).toHaveLength(1);
  });
});
