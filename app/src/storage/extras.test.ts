// Plan, leftovers, batches and favourites (updates 2): saved, replayed, and backed up.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { seed } from '../data/seed';
import type { Batch, Favourite, KitchenData, Leftover, PlannedMeal } from '../domain/types';
import { exportBackup, parseBackup } from './backup';
import { kitchenWriter, loadKitchen, openKitchenDb, replaceAll } from './db';

const meal: PlannedMeal = {
  id: 'pm1', localDate: '2026-10-07', slot: 'dinner', servings: 4, status: 'planned',
  items: [
    { kind: 'dish', recipeId: seed.recipes[0].id, recipeName: seed.recipes[0].name },
    { kind: 'eatout', label: 'Pizza night' },
    { kind: 'leftover', leftoverId: 'lo1', label: 'Daal', portions: 2 },
  ],
};
const leftover: Leftover = {
  id: 'lo1', name: 'Daal', portionsMade: 4, portionsLeft: 4, madeOn: '2026-10-05', location: 'fridge',
  log: [{ at: '2026-10-05T10:00:00.000Z', localDate: '2026-10-05', kind: 'made', portions: 4 }],
};
const batch: Batch = {
  id: 'b1', ingredientId: seed.ingredients[0].id, amount: 1000, location: 'freezer', expiresOn: '2026-12-01',
  packageSize: { amount: 1, unit: 'kg' },
};
const favourite: Favourite = { id: 'f1', dish: 'Chicken Tikka', place: 'Test Grill', url: 'https://foodpanda.pk/restaurant/abcd/test', moods: ['BBQ'] };

let n = 0;
const open = () => openKitchenDb(`extras-${++n}-${Math.random()}`);

describe('new collections', () => {
  it('are saved by id, replaced not duplicated on retry, and deleted', async () => {
    const db = await open();
    await replaceAll(db, seed);
    const write = kitchenWriter(db);
    await write({ type: 'plan', meal });
    await write({ type: 'plan', meal });
    await write({ type: 'leftover', item: leftover });
    await write({ type: 'batch', item: batch });
    await write({ type: 'favourite', item: favourite });
    let data = (await loadKitchen(db))!;
    expect(data.plan).toEqual([meal]);
    expect(data.leftovers).toEqual([leftover]);
    expect(data.batches).toEqual([batch]);
    expect(data.favourites).toEqual([favourite]);
    await write({ type: 'plan', meal: { ...meal, status: 'cancelled' } });
    await write({ type: 'deleteLeftover', id: 'lo1' });
    data = (await loadKitchen(db))!;
    expect(data.plan?.[0].status).toBe('cancelled');
    expect(data.leftovers).toBeUndefined();
  });

  it('leave a kitchen without them exactly as before', async () => {
    const db = await open();
    await replaceAll(db, seed);
    const data = (await loadKitchen(db))!;
    expect(Object.keys(data).sort()).toEqual(['events', 'ingredients', 'recipes', 'schemaVersion', 'settings']);
    expect(data.recipes).toHaveLength(seed.recipes.length);
  });

  it('survive a restore: replaceAll writes and clears them', async () => {
    const db = await open();
    const full: KitchenData = { ...seed, plan: [meal], leftovers: [leftover], batches: [batch], favourites: [favourite] };
    await replaceAll(db, full);
    const loaded = (await loadKitchen(db))!;
    expect([loaded.plan, loaded.leftovers, loaded.batches, loaded.favourites]).toEqual([[meal], [leftover], [batch], [favourite]]);
    await replaceAll(db, seed);
    const cleared = (await loadKitchen(db))!;
    expect([cleared.plan, cleared.leftovers, cleared.batches, cleared.favourites]).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('backups with the new collections', () => {
  const full: KitchenData = { ...seed, plan: [meal], leftovers: [leftover], batches: [batch], favourites: [favourite] };

  it('round-trip', () => {
    const parsed = parseBackup(exportBackup(full));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    if (parsed.ok) {
      expect(parsed.data.plan).toEqual([meal]);
      expect(parsed.data.leftovers).toEqual([leftover]);
      expect(parsed.data.batches).toEqual([batch]);
      expect(parsed.data.favourites).toEqual([favourite]);
    }
  });

  it('older backups without them still restore', () => {
    const parsed = parseBackup(exportBackup(seed));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.plan).toBeUndefined();
  });

  it('refuse dangling links and unsafe links', () => {
    const bad = JSON.parse(exportBackup(full));
    bad.plan[0].items[0].recipeId = 'NOPE';
    bad.plan[0].items[2].leftoverId = 'NOPE';
    bad.batches[0].ingredientId = 'NOPE';
    bad.favourites[0].url = 'javascript:alert(1)';
    const parsed = parseBackup(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
    const text = parsed.ok ? '' : parsed.errors.join('\n');
    expect(text).toContain('plan[0].items[0].recipeId');
    expect(text).toContain('plan[0].items[2].leftoverId');
    expect(text).toContain('batches[0].ingredientId');
    expect(text).toContain('favourites[0].url');
  });
});

describe('a kitchen with leftovers and batches (F65, F66)', () => {
  it('round-trips through backup, restore and the database unchanged', async () => {
    const full: KitchenData = { ...seed, leftovers: [leftover], batches: [batch] };
    const parsed = parseBackup(exportBackup(full));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    if (!parsed.ok) return;
    expect(parsed.data.leftovers).toEqual([leftover]);
    expect(parsed.data.batches).toEqual([batch]);
    const db = await open();
    await replaceAll(db, parsed.data);
    const loaded = (await loadKitchen(db))!;
    expect(loaded.leftovers).toEqual([leftover]);
    expect(loaded.batches).toEqual([batch]);
    expect(parseBackup(exportBackup(loaded)).ok).toBe(true);
  });
});
