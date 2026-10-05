// Where to buy (D-22). Pure helpers for store links, store editing, grouping and list text.
// No prices or stock are ever read or claimed, and nothing is ever added to a store's cart:
// a link only opens the store's own page. Whether a link opens the store's phone app is
// UNVERIFIED (it depends on the phone and the store). Only https links are accepted.
import { cleanText } from '../gemini/sanitize';
import type { Ingredient, ShopPrefs, Store, StoreKind } from './types';
import { fromBase } from './units';

/** The least a cart line needs, so any screen's own line type fits. */
export interface StoreLine { ingredientId: string; amountBase: number | null }

export const STORE_KIND_LABEL: Record<StoreKind, string> = {
  'online-search': 'Search a website',
  'copy-list': 'Copy the list then open',
  'maps-only': 'Directions only',
};

// https, a real host with no {q} in it, then a path/query/end. {q} must come after the host.
const HTTPS_HOST = /^https:\/\/[^\s/?#{}]+(?:[/?#]|$)/i;

/** True for an https link with a usable host (no javascript:, data:, http:). */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!/^https:\/\//i.test(v) || /\s/.test(v)) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

/** An https search template with at least one {q} placed after the host. */
export function isSearchTemplate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.includes('{q}') && HTTPS_HOST.test(v) && isHttpsUrl(v.split('{q}').join('x'));
}

/** Link that searches `itemName` on an online-search store, or null when that is not possible. */
export function searchUrl(store: Store, itemName: string): string | null {
  if (store.kind !== 'online-search' || !isSearchTemplate(store.searchUrl)) return null;
  const name = cleanText(itemName, 80);
  if (!name) return null;
  return store.searchUrl.trim().split('{q}').join(encodeURIComponent(name));
}

/** Google Maps search for a place or nearest branch. */
export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanText(query, 120))}`;
}

export interface StoreInput {
  id?: string;
  name?: string;
  kind?: string;
  searchUrl?: string;
  openUrl?: string;
  mapsQuery?: string;
  unverified?: boolean;
  note?: string;
}
export type StoreResult = { ok: true; store: Store } | { ok: false; errors: string[] };

/** A safe id from a name that no other store uses: "Al Fatah!" -> "al-fatah", then "al-fatah-2". */
export function deriveStoreId(name: string, taken: readonly string[]): string {
  const base = cleanText(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'store';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Checks what Noor typed and returns a clean Store, or every problem in plain words.
 * `existing` is the current store list (for the unique id). When editing, the id in `input` is kept.
 */
export function validateStore(input: StoreInput, existing: readonly Store[] = []): StoreResult {
  const errors: string[] = [];
  const name = cleanText(input.name, 60);
  if (!name) errors.push('Give the store a name.');
  const kind = input.kind;
  if (kind !== 'online-search' && kind !== 'copy-list' && kind !== 'maps-only') errors.push('Choose what this store does: search a website, copy the list then open it, or directions only.');
  const searchUrlRaw = (input.searchUrl ?? '').trim();
  const openUrlRaw = (input.openUrl ?? '').trim();
  const mapsQuery = cleanText(input.mapsQuery, 120);
  if (kind === 'online-search') {
    if (!searchUrlRaw) errors.push('Paste the store\'s search link. It must start with https:// and have {q} where the item name goes.');
    else if (!isSearchTemplate(searchUrlRaw)) errors.push('The search link must start with https:// and have {q} after the website name, where the item name goes.');
  }
  if (kind === 'copy-list') {
    if (!openUrlRaw) errors.push('Paste the link to open after the list is copied. It must start with https://.');
    else if (!isHttpsUrl(openUrlRaw)) errors.push('The link to open must start with https://.');
  }
  if (kind === 'maps-only' && !mapsQuery) errors.push('Type what to look for on the map, for example "grocery store near I-8 Markaz".');
  if (errors.length) return { ok: false, errors };

  const taken = existing.map(s => s.id).filter(id => id !== input.id);
  const id = input.id && /^[a-z0-9][a-z0-9-]*$/.test(input.id) ? input.id : deriveStoreId(name, taken);
  const note = cleanText(input.note, 200);
  const store: Store = { id, name, kind: kind as StoreKind };
  if (kind === 'online-search') store.searchUrl = searchUrlRaw;
  if (kind === 'copy-list') store.openUrl = openUrlRaw;
  if (mapsQuery) store.mapsQuery = mapsQuery;
  if (input.unverified === true) store.unverified = true;
  if (note) store.note = note;
  return { ok: true, store };
}

/** Adds a store, or replaces the one with the same id (keeping its place). */
export function upsertStore(prefs: ShopPrefs, store: Store): ShopPrefs {
  const has = prefs.stores.some(s => s.id === store.id);
  return { ...prefs, stores: has ? prefs.stores.map(s => (s.id === store.id ? store : s)) : [...prefs.stores, store] };
}

/** Deletes a store and clears it from every item's preferred store. */
export function removeStore(prefs: ShopPrefs, storeId: string): ShopPrefs {
  return {
    ...prefs,
    stores: prefs.stores.filter(s => s.id !== storeId),
    preferred: Object.fromEntries(Object.entries(prefs.preferred).filter(([, id]) => id !== storeId)),
  };
}

/** Sets (or with null clears) an item's preferred store. Unknown store ids are ignored. */
export function setPreferred(prefs: ShopPrefs, ingredientId: string, storeId: string | null): ShopPrefs {
  const rest = Object.fromEntries(Object.entries(prefs.preferred).filter(([k]) => k !== ingredientId));
  if (storeId === null || !prefs.stores.some(s => s.id === storeId)) return { ...prefs, preferred: rest };
  return { ...prefs, preferred: { ...rest, [ingredientId]: storeId } };
}

/** The usual stores again. Choices that point at a store that no longer exists are dropped. */
export function resetStores(prefs: ShopPrefs, usual: readonly Store[]): ShopPrefs {
  const ids = new Set(usual.map(s => s.id));
  return {
    ...prefs,
    stores: usual.map(s => ({ ...s })),
    preferred: Object.fromEntries(Object.entries(prefs.preferred).filter(([, id]) => ids.has(id))),
  };
}

/** The item's preferred store, or null for "Any store". */
export function preferredStore(prefs: ShopPrefs, ingredientId: string): Store | null {
  const id = prefs.preferred[ingredientId];
  return (id && prefs.stores.find(s => s.id === id)) || null;
}

export interface StoreGroup<L> { store: Store | null; lines: L[] }

const byAisleThenName = (ings: Map<string, Ingredient>) => (a: StoreLine, b: StoreLine) => {
  const x = ings.get(a.ingredientId), y = ings.get(b.ingredientId);
  return (x?.aisle ?? 'Other').localeCompare(y?.aisle ?? 'Other') || (x?.name ?? a.ingredientId).localeCompare(y?.name ?? b.ingredientId);
};

/** Lines grouped by preferred store (store order as in prefs), "Any store" (store: null) last. Empty groups are left out. */
export function groupByStore<L extends StoreLine>(lines: readonly L[], prefs: ShopPrefs, ingredients: readonly Ingredient[]): StoreGroup<L>[] {
  const ings = new Map(ingredients.map(i => [i.id, i]));
  const sort = byAisleThenName(ings);
  const groups: StoreGroup<L>[] = prefs.stores.map(store => ({ store, lines: [] }));
  const any: StoreGroup<L> = { store: null, lines: [] };
  for (const line of lines) {
    const id = prefs.preferred[line.ingredientId];
    (groups.find(g => g.store!.id === id) ?? any).lines.push(line);
  }
  return [...groups, any].filter(g => g.lines.length > 0).map(g => ({ ...g, lines: [...g.lines].sort(sort) }));
}

function lineText(line: StoreLine, ings: Map<string, Ingredient>): string {
  const ing = ings.get(line.ingredientId);
  const name = ing?.name ?? line.ingredientId;
  const n = line.amountBase;
  if (!ing || n === null || !Number.isFinite(n) || n <= 0) return `- ${name} (check)`;
  const { amount, unit } = fromBase(n, ing);
  return `- ${name} - ${amount} ${unit}`;
}

/** Plain text to share. By store: a heading per store ("Any store" last). By aisle: a heading per aisle, with the store in brackets when one is chosen. */
export function listText<L extends StoreLine>(
  lines: readonly L[], ingredients: readonly Ingredient[],
  opts: { groupBy: 'store' | 'aisle'; prefs: ShopPrefs },
): string {
  if (lines.length === 0) return '';
  const ings = new Map(ingredients.map(i => [i.id, i]));
  const blocks: string[] = [];
  if (opts.groupBy === 'store') {
    for (const g of groupByStore(lines, opts.prefs, ingredients)) {
      blocks.push([g.store ? g.store.name : 'Any store', ...g.lines.map(l => lineText(l, ings))].join('\n'));
    }
  } else {
    const aisles: string[] = [];
    const sorted = [...lines].sort(byAisleThenName(ings));
    for (const l of sorted) { const a = ings.get(l.ingredientId)?.aisle ?? 'Other'; if (!aisles.includes(a)) aisles.push(a); }
    for (const aisle of aisles) {
      blocks.push([aisle, ...sorted.filter(l => (ings.get(l.ingredientId)?.aisle ?? 'Other') === aisle).map(l => {
        const s = preferredStore(opts.prefs, l.ingredientId);
        return lineText(l, ings) + (s ? ` [${s.name}]` : '');
      })].join('\n'));
    }
  }
  return blocks.join('\n\n');
}

/**
 * Text for a copy-list store such as pandamart: what is meant for that store plus the
 * "Any store" items (those can be bought anywhere). Empty string when there is nothing.
 */
export function copyListText<L extends StoreLine>(
  lines: readonly L[], ingredients: readonly Ingredient[], store: Store, prefs: ShopPrefs,
): string {
  const ings = new Map(ingredients.map(i => [i.id, i]));
  const mine = groupByStore(lines, prefs, ingredients)
    .filter(g => g.store === null || g.store.id === store.id)
    .flatMap(g => g.lines)
    .sort(byAisleThenName(ings));
  if (mine.length === 0) return '';
  return [`To buy for ${store.name}`, ...mine.map(l => lineText(l, ings))].join('\n');
}
