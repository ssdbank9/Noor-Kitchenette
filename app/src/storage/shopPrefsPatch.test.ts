import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { applyShopPrefsPatch, diffShopPrefs } from './shopPrefsPatch';
import { loadKitchen, openKitchenDb, replaceAll, saveShopPrefsPatch, type KitchenDb } from './db';
import { defaultShopPrefs } from '../domain/shopPrefs';
import { seed } from '../data/seed';
import type { ShopPrefs } from '../domain/types';

// Regression tests for GLM review N2: shop preferences were saved as a whole record, so two open
// tabs editing different fields lost one edit. A `shopPrefsPatch` names only the fields that
// changed and is applied to the stored value.

const base = (): ShopPrefs => defaultShopPrefs();
const snoozeOnion = (prefs: ShopPrefs): ShopPrefs => ({ ...prefs, dismissed: [{ ingredientId: 'Onion', kind: 'snooze', until: '2026-10-12' }] });
const aTrip = (prefs: ShopPrefs): ShopPrefs => ({ ...prefs, trip: { id: 't1', startedAt: '2026-10-06T10:00:00.000Z', got: {} } });

describe('shop preference patches', () => {
  it('composes a snooze and a started trip from two tabs (N2)', () => {
    const start = base();
    const afterA = applyShopPrefsPatch(start, diffShopPrefs(start, snoozeOnion(start))); // tab A snoozes
    const afterB = applyShopPrefsPatch(afterA, diffShopPrefs(start, aTrip(start))); // tab B starts a trip from the same stale copy
    expect(afterB.dismissed).toEqual([{ ingredientId: 'Onion', kind: 'snooze', until: '2026-10-12' }]);
    expect(afterB.trip?.id).toBe('t1');
  });

  it('keys per-item store choices, so two different items both stick', () => {
    const start = base();
    const tabA = diffShopPrefs(start, { ...start, preferred: { Onion: 'alfatah' } });
    const tabB = diffShopPrefs(start, { ...start, preferred: { Tomato: 'local' } });
    const after = applyShopPrefsPatch(applyShopPrefsPatch(start, tabA), tabB);
    expect(after.preferred).toEqual({ Onion: 'alfatah', Tomato: 'local' });
  });

  it('clears only the trip when the trip ends', () => {
    const start: ShopPrefs = { ...base(), preferred: { Onion: 'alfatah' }, trip: { id: 't1', startedAt: 'x', got: { Onion: 2 } } };
    const ended: ShopPrefs = { stores: start.stores, preferred: start.preferred, dismissed: start.dismissed };
    const next = applyShopPrefsPatch(start, diffShopPrefs(start, ended));
    expect(next.trip).toBeUndefined();
    expect(next.preferred).toEqual({ Onion: 'alfatah' });
  });
});

describe('saveShopPrefsPatch', () => {
  const opened: KitchenDb[] = [];
  afterEach(() => { for (const db of opened.splice(0)) db.close(); });

  it('applies two independent field changes to the stored value', async () => {
    const db = await openKitchenDb('shopprefs-patch');
    opened.push(db);
    await replaceAll(db, seed);
    const start = base();
    await saveShopPrefsPatch(db, diffShopPrefs(start, snoozeOnion(start)));
    await saveShopPrefsPatch(db, diffShopPrefs(start, aTrip(start)));

    const saved = (await loadKitchen(db))!.shopPrefs!;
    expect(saved.dismissed).toHaveLength(1);
    expect(saved.trip?.id).toBe('t1');
  });
});
