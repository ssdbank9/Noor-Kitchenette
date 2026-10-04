import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { KitchenData, KitchenEvent } from '../domain/types';
import {
  kitchenWriter,
  loadKitchen,
  loadPreRestoreBackup,
  openKitchenDb,
  replaceAll,
  replaceAllKeepingCopy,
  saveEvents,
  saveIngredient,
  saveRecipe,
  saveSettings,
  type KitchenDb,
} from './db';
import { testKitchen } from './testKitchen';

let opened: KitchenDb[] = [];
let dbCount = 0;

async function freshDb(): Promise<KitchenDb> {
  const db = await openKitchenDb(`db-test-${++dbCount}`);
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened) db.close();
  opened = [];
});

const purchase = (id: string, at: string): KitchenEvent => ({
  id,
  kind: 'purchase',
  at,
  localDate: '2026-10-04',
  localTime: '12:00',
  timeZone: 'Asia/Karachi',
  movements: [{ ingredientId: 'Eggs', delta: 6, basis: 'measured' }],
});

describe('kitchen database', () => {
  it('returns null before anything is saved', async () => {
    expect(await loadKitchen(await freshDb())).toBeNull();
  });

  it('round trip: replaceAll then loadKitchen returns the same data', async () => {
    const db = await freshDb();
    const kitchen = testKitchen();
    await replaceAll(db, kitchen);
    expect(await loadKitchen(db)).toEqual(kitchen);
  });

  it('survives closing and reopening the database', async () => {
    const name = `db-test-reopen-${++dbCount}`;
    const first = await openKitchenDb(name);
    await replaceAll(first, testKitchen());
    first.close();
    const second = await openKitchenDb(name);
    opened.push(second);
    expect(await loadKitchen(second)).toEqual(testKitchen());
  });

  it('replaceAll removes records that are not in the new data', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const smaller: KitchenData = { ...testKitchen(), events: [], recipes: [] };
    await replaceAll(db, smaller);
    expect(await loadKitchen(db)).toEqual(smaller);
  });

  it('replaceAll is all-or-nothing: a bad record leaves the old data untouched', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const broken = testKitchen();
    broken.recipes = [];
    broken.events.push({ ...broken.events[0], id: undefined as unknown as string }); // no key: IndexedDB refuses it
    await expect(replaceAll(db, broken)).rejects.toThrow();
    expect(await loadKitchen(db)).toEqual(testKitchen());
  });

  it('refuses data with a repeated id instead of silently keeping only one record', async () => {
    const db = await freshDb();
    const kitchen = testKitchen();
    kitchen.events.push({ ...kitchen.events[0] });
    await expect(replaceAll(db, kitchen)).rejects.toThrow('Two events have the id "e1"');
    expect(await loadKitchen(db)).toBeNull();
  });

  it('refuses a schema version it does not write', async () => {
    const db = await freshDb();
    await expect(replaceAll(db, { ...testKitchen(), schemaVersion: 2 })).rejects.toThrow('schema version 2');
  });

  it('saves single records after setup, and returns events in time order', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const late = purchase('a-late', '2026-10-04T10:00:00.000Z');
    const early = purchase('z-early', '2026-10-04T06:00:00.000Z');
    await saveEvents(db, [late, early]);
    const recipe = { ...testKitchen().recipes[1], name: 'Anda paratha (crispy)', version: 2 };
    await saveRecipe(db, recipe);
    const ingredient = { ...testKitchen().ingredients[1], minStock: 6 };
    await saveIngredient(db, ingredient);
    const settings = { ...testKitchen().settings, defaultServings: 6 };
    await saveSettings(db, settings);

    const loaded = await loadKitchen(db);
    expect(loaded?.events.map(e => e.id)).toEqual(['e1', 'e2', 'e3', 'z-early', 'a-late']);
    expect(loaded?.recipes.find(r => r.id === 'R002')).toEqual(recipe);
    expect(loaded?.ingredients.find(i => i.id === 'Eggs')).toEqual(ingredient);
    expect(loaded?.settings).toEqual(settings);
  });

  it('an event written twice (a retry) is stored once', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const event = purchase('e-retry', '2026-10-04T07:00:00.000Z');
    await saveEvents(db, [event]);
    await saveEvents(db, [event]);
    const write = kitchenWriter(db);
    await write({ type: 'events', events: [event] });
    const ids = (await loadKitchen(db))!.events.map(e => e.id);
    expect(ids.filter(id => id === 'e-retry')).toHaveLength(1);
    expect(ids).toHaveLength(4);
  });

  it('kitchenWriter routes each kind of write', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const write = kitchenWriter(db);
    await write({ type: 'events', events: [purchase('e4', '2026-10-04T07:00:00.000Z')] });
    await write({ type: 'settings', settings: { ...testKitchen().settings, householdName: 'Home' } });
    const loaded = await loadKitchen(db);
    expect(loaded?.events.map(e => e.id)).toContain('e4');
    expect(loaded?.settings.householdName).toBe('Home');
  });

  it('a failed write throws and saves nothing from its batch', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const good = purchase('e9', '2026-10-04T07:00:00.000Z');
    const bad = { ...good, id: undefined as unknown as string };
    await expect(saveEvents(db, [good, bad])).rejects.toThrow();
    expect((await loadKitchen(db))?.events.map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('refuses single-record writes before the kitchen is set up', async () => {
    const db = await freshDb();
    await expect(saveEvents(db, [purchase('e1', '2026-10-04T07:00:00.000Z')])).rejects.toThrow('not been set up');
    expect(await loadKitchen(db)).toBeNull();
  });

  it('replaceAllKeepingCopy stores the previous kitchen with the time, in the same step', async () => {
    const db = await freshDb();
    await replaceAll(db, testKitchen());
    const next: KitchenData = { ...testKitchen(), events: [] };
    const takenAt = new Date('2026-10-04T09:00:00.000Z');
    const copy = await replaceAllKeepingCopy(db, next, takenAt);
    expect(copy).toEqual({ takenAt: '2026-10-04T09:00:00.000Z', data: testKitchen() });
    expect(await loadPreRestoreBackup(db)).toEqual(copy);
    expect(await loadKitchen(db)).toEqual(next);
  });

  it('replaceAllKeepingCopy on an empty database keeps no copy', async () => {
    const db = await freshDb();
    expect(await replaceAllKeepingCopy(db, testKitchen())).toBeNull();
    expect(await loadPreRestoreBackup(db)).toBeNull();
    expect(await loadKitchen(db)).toEqual(testKitchen());
  });
});
