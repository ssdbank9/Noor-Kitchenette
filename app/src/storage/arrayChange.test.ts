import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { applyArrayChange, diffByKey } from './arrayChange';
import { loadKitchen, openKitchenDb, replaceAll, saveSettingsPatch, type KitchenDb } from './db';
import { testKitchen } from './testKitchen';

// The data layer behind the cross-tab fix (AR14/A1): a change applied to the CURRENT stored
// value, not to a caller's stale copy. These are the plain-function guarantees that make two
// tabs' edits compose instead of clobbering each other.

interface Row { id: string; n: number }
const key = (r: Row) => r.id;

describe('array changes', () => {
  it('diffs adds, edits and removals by key', () => {
    const before: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
    const after: Row[] = [{ id: 'a', n: 9 }, { id: 'c', n: 3 }];
    expect(diffByKey(before, after, key)).toEqual({ upserts: [{ id: 'a', n: 9 }, { id: 'c', n: 3 }], remove: ['b'] });
  });

  it('composes two independent deltas, so neither tab loses its row', () => {
    const start: Row[] = [];
    const tabA = diffByKey(start, [{ id: 'a', n: 1 }], key); // tab A adds a
    const tabB = diffByKey(start, [{ id: 'b', n: 2 }], key); // tab B adds b, from the same stale start
    const afterA = applyArrayChange(start, tabA, key);
    const afterB = applyArrayChange(afterA, tabB, key); // B applies to the freshly stored value
    expect(afterB).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
  });

  it('removes before upserting, and replaces in place', () => {
    const current: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
    const result = applyArrayChange(current, { upserts: [{ id: 'b', n: 5 }, { id: 'c', n: 3 }], remove: ['a'] }, key);
    expect(result).toEqual([{ id: 'b', n: 5 }, { id: 'c', n: 3 }]);
  });
});

describe('settings patch', () => {
  const opened: KitchenDb[] = [];
  afterEach(() => { for (const db of opened.splice(0)) db.close(); });

  it('merges changed keys and deletes a key set to undefined', async () => {
    const db = await openKitchenDb('arraychange-settings');
    opened.push(db);
    const start = testKitchen();
    start.settings.homeArea = { label: 'I-8 Markaz', lat: 33.668, lng: 73.075 };
    await replaceAll(db, start);

    await saveSettingsPatch(db, { defaultServings: 6 });
    await saveSettingsPatch(db, { homeArea: undefined });

    const saved = await loadKitchen(db);
    expect(saved?.settings.defaultServings).toBe(6);
    expect('homeArea' in (saved?.settings ?? {})).toBe(false);
  });
});
