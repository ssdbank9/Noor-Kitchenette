// Field-level changes to shop preferences, so two open tabs do not erase each other's edits
// (GLM review N2). `stores` and the trip are small whole values; per-item store choices and
// dismissals are keyed changes that compose, like the shopping-list changes in arrayChange.ts.
import type { Dismissal, ShopPrefs, Store, Trip } from '../domain/types';
import { applyArrayChange, diffByKey, type ArrayChange } from './arrayChange';

export interface PreferredEntry {
  ingredientId: string;
  storeId: string;
}

export interface ShopPrefsPatch {
  /** Whole list, replaced only when the store list itself changed. */
  stores?: Store[];
  preferred?: ArrayChange<PreferredEntry>;
  dismissed?: ArrayChange<Dismissal>;
  /** The trip to set, or null to clear it. Omitted means "leave the trip alone". */
  trip?: Trip | null;
}

const entryKey = (entry: PreferredEntry) => entry.ingredientId;
const entriesOf = (map: Record<string, string>): PreferredEntry[] =>
  Object.entries(map).map(([ingredientId, storeId]) => ({ ingredientId, storeId }));
const mapOf = (entries: PreferredEntry[]): Record<string, string> =>
  Object.fromEntries(entries.map(entry => [entry.ingredientId, entry.storeId]));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The change from `before` to `after`. Fields that did not change are omitted. */
export function diffShopPrefs(before: ShopPrefs, after: ShopPrefs): ShopPrefsPatch {
  const patch: ShopPrefsPatch = {};
  if (!same(before.stores, after.stores)) patch.stores = after.stores;
  const preferred = diffByKey(entriesOf(before.preferred), entriesOf(after.preferred), entryKey);
  if (preferred.upserts.length || preferred.remove.length) patch.preferred = preferred;
  const dismissed = diffByKey(before.dismissed, after.dismissed, dismissal => dismissal.ingredientId);
  if (dismissed.upserts.length || dismissed.remove.length) patch.dismissed = dismissed;
  if (!same(before.trip, after.trip)) patch.trip = after.trip ?? null;
  return patch;
}

/** `current` with the patch applied. A field the patch does not name is left as it is. */
export function applyShopPrefsPatch(current: ShopPrefs, patch: ShopPrefsPatch): ShopPrefs {
  const next: ShopPrefs = { ...current };
  if (patch.stores) next.stores = patch.stores;
  if (patch.preferred) next.preferred = mapOf(applyArrayChange(entriesOf(current.preferred), patch.preferred, entryKey));
  if (patch.dismissed) next.dismissed = applyArrayChange(current.dismissed, patch.dismissed, dismissal => dismissal.ingredientId);
  if (patch.trip !== undefined) {
    if (patch.trip === null) delete next.trip;
    else next.trip = patch.trip;
  }
  return next;
}
