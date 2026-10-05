import { describe, expect, it } from 'vitest';
import { DEFAULT_STORES, defaultShopPrefs } from './shopPrefs';
import { copyListText, deriveStoreId, groupByStore, isSearchTemplate, listText, mapsUrl, preferredStore, removeStore, resetStores, searchUrl, setPreferred, upsertStore, validateStore } from './stores';
import type { Ingredient, ShopPrefs, Store } from './types';

const ing = (id: string, name: string, aisle: string, dimension: Ingredient['dimension'] = 'mass', displayUnit = 'kg'): Ingredient =>
  ({ id, name, aliases: [], dimension, displayUnit, aisle, conversions: {} } as unknown as Ingredient);
const ings = [
  ing('rice', 'Rice', 'Pantry'),
  ing('tomato', 'Tomatoes', 'Produce'),
  ing('onion', 'Onions', 'Produce'),
  ing('milk', 'Milk', 'Dairy', 'volume', 'L'),
];
const alfatah = DEFAULT_STORES[0], panda = DEFAULT_STORES[1], local = DEFAULT_STORES[3];

describe('searchUrl', () => {
  it('fills {q} with the encoded name', () => {
    expect(searchUrl(alfatah, 'Basmati rice')).toBe('https://alfatah.pk/search?q=Basmati%20rice');
  });
  it('encodes ampersands and symbols', () => {
    expect(searchUrl(alfatah, 'salt & pepper')).toBe('https://alfatah.pk/search?q=salt%20%26%20pepper');
  });
  it('encodes Urdu and Roman Urdu names', () => {
    expect(searchUrl(alfatah, 'پیاز')).toBe(`https://alfatah.pk/search?q=${encodeURIComponent('پیاز')}`);
    expect(searchUrl(alfatah, 'Aloo Bukhara')).toBe('https://alfatah.pk/search?q=Aloo%20Bukhara');
  });
  it('cleans control characters and spacing', () => {
    expect(searchUrl(alfatah, '  rice \n\t flour ')).toBe('https://alfatah.pk/search?q=rice%20flour');
  });
  it('is null for an empty name', () => {
    expect(searchUrl(alfatah, '')).toBeNull();
    expect(searchUrl(alfatah, '  \n ')).toBeNull();
  });
  it('is null for stores that do not search', () => {
    expect(searchUrl(panda, 'rice')).toBeNull();
    expect(searchUrl(local, 'rice')).toBeNull();
  });
  it('is null for an invalid template', () => {
    const bad = (t: string): Store => ({ id: 'x', name: 'X', kind: 'online-search', searchUrl: t });
    expect(searchUrl(bad('http://x.pk/?q={q}'), 'a')).toBeNull();
    expect(searchUrl(bad('https://x.pk/?q='), 'a')).toBeNull();
    expect(searchUrl(bad('javascript:alert({q})'), 'a')).toBeNull();
    expect(searchUrl(bad('https://{q}.evil.pk/'), 'a')).toBeNull();
    expect(searchUrl({ id: 'x', name: 'X', kind: 'online-search' }, 'a')).toBeNull();
  });
  it('replaces every {q}', () => {
    expect(searchUrl({ id: 'x', name: 'X', kind: 'online-search', searchUrl: 'https://x.pk/s?a={q}&b={q}' }, 'a b')).toBe('https://x.pk/s?a=a%20b&b=a%20b');
  });
});

describe('isSearchTemplate', () => {
  it('accepts https templates with {q} after the host', () => {
    expect(isSearchTemplate('https://x.pk/search?q={q}')).toBe(true);
    expect(isSearchTemplate('https://x.pk/{q}')).toBe(true);
  });
  it('refuses the rest', () => {
    for (const v of ['', 'https://x.pk/', 'http://x.pk/?q={q}', 'data:text/html,{q}', 'https://x.pk{q}', 'https:///?q={q}', 'https://x pk/?q={q}', 5, undefined]) expect(isSearchTemplate(v)).toBe(false);
  });
});

describe('mapsUrl', () => {
  it('builds a Maps search link', () => {
    expect(mapsUrl('Carrefour Islamabad')).toBe('https://www.google.com/maps/search/?api=1&query=Carrefour%20Islamabad');
    expect(mapsUrl('shop & mart, I-8')).toBe('https://www.google.com/maps/search/?api=1&query=shop%20%26%20mart%2C%20I-8');
  });
});

describe('validateStore', () => {
  const errs = (r: ReturnType<typeof validateStore>) => (r.ok ? [] : r.errors);
  it('needs a name and a kind', () => {
    expect(errs(validateStore({ name: '  ', kind: 'maps-only', mapsQuery: 'x' })).join(' ')).toContain('name');
    expect(errs(validateStore({ name: 'A' })).join(' ')).toContain('Choose');
    expect(errs(validateStore({ name: 'A', kind: 'bogus' })).join(' ')).toContain('Choose');
  });
  it('online-search needs an https link with {q}', () => {
    expect(errs(validateStore({ name: 'A', kind: 'online-search' }))[0]).toContain('search link');
    expect(errs(validateStore({ name: 'A', kind: 'online-search', searchUrl: 'https://a.pk/' }))[0]).toContain('{q}');
    expect(errs(validateStore({ name: 'A', kind: 'online-search', searchUrl: 'http://a.pk/?q={q}' }))[0]).toContain('https://');
    expect(errs(validateStore({ name: 'A', kind: 'online-search', searchUrl: 'javascript:alert(1)//{q}' })).length).toBe(1);
    expect(errs(validateStore({ name: 'A', kind: 'online-search', searchUrl: 'data:text/html,{q}' })).length).toBe(1);
  });
  it('copy-list needs an https open link', () => {
    expect(errs(validateStore({ name: 'A', kind: 'copy-list' }))[0]).toContain('https://');
    expect(errs(validateStore({ name: 'A', kind: 'copy-list', openUrl: 'http://a.pk' }))[0]).toContain('https://');
    expect(errs(validateStore({ name: 'A', kind: 'copy-list', openUrl: 'javascript:alert(1)' })).length).toBe(1);
    expect(errs(validateStore({ name: 'A', kind: 'copy-list', openUrl: 'data:text/html,hi' })).length).toBe(1);
  });
  it('maps-only needs something to look for', () => {
    expect(errs(validateStore({ name: 'A', kind: 'maps-only' }))[0]).toContain('map');
  });
  it('reports every problem at once', () => {
    expect(errs(validateStore({ kind: 'online-search' })).length).toBe(2);
  });
  it('builds a valid store of each kind', () => {
    const a = validateStore({ name: 'Metro', kind: 'online-search', searchUrl: ' https://metro.pk/s?q={q} ', mapsQuery: 'Metro Islamabad' });
    expect(a).toEqual({ ok: true, store: { id: 'metro', name: 'Metro', kind: 'online-search', searchUrl: 'https://metro.pk/s?q={q}', mapsQuery: 'Metro Islamabad' } });
    const b = validateStore({ name: 'Grocer', kind: 'copy-list', openUrl: 'https://grocer.pk/', searchUrl: 'https://ignored/{q}' });
    expect(b).toEqual({ ok: true, store: { id: 'grocer', name: 'Grocer', kind: 'copy-list', openUrl: 'https://grocer.pk/' } });
    const c = validateStore({ name: 'Bhai shop', kind: 'maps-only', mapsQuery: 'shop near I-8', note: 'ask for Bhai' });
    expect(c).toEqual({ ok: true, store: { id: 'bhai-shop', name: 'Bhai shop', kind: 'maps-only', mapsQuery: 'shop near I-8', note: 'ask for Bhai' } });
  });
  it('keeps the unverified flag only when given', () => {
    const r = validateStore({ name: 'A', kind: 'online-search', searchUrl: 'https://a.pk/?q={q}', unverified: true });
    expect(r.ok && r.store.unverified).toBe(true);
  });
  it('derives a safe unique id, and keeps the id when editing', () => {
    const taken: Store[] = [{ id: 'al-fatah', name: 'x', kind: 'maps-only' }];
    const r = validateStore({ name: 'Al Fatah!', kind: 'maps-only', mapsQuery: 'q' }, taken);
    expect(r.ok && r.store.id).toBe('al-fatah-2');
    const e = validateStore({ id: 'al-fatah', name: 'Al Fatah!', kind: 'maps-only', mapsQuery: 'q' }, taken);
    expect(e.ok && e.store.id).toBe('al-fatah');
    expect(deriveStoreId('پیاز', [])).toBe('store');
    expect(deriveStoreId('<script>', [])).toBe('script');
  });
  it('cleans the name', () => {
    const r = validateStore({ name: ' A\u0000  B ', kind: 'maps-only', mapsQuery: 'q' });
    expect(r.ok && r.store.name).toBe('A B');
  });
});

describe('preferences', () => {
  const prefs = (): ShopPrefs => ({ ...defaultShopPrefs(), preferred: { rice: 'alfatah', milk: 'pandamart', onion: 'local' } });
  it('deleting a store clears it from preferred', () => {
    const next = removeStore(prefs(), 'alfatah');
    expect(next.stores.map(s => s.id)).toEqual(['pandamart', 'carrefour', 'local']);
    expect(next.preferred).toEqual({ milk: 'pandamart', onion: 'local' });
  });
  it('setPreferred sets, clears, and ignores unknown stores', () => {
    expect(setPreferred(prefs(), 'tomato', 'carrefour').preferred.tomato).toBe('carrefour');
    expect(setPreferred(prefs(), 'rice', null).preferred).not.toHaveProperty('rice');
    expect(setPreferred(prefs(), 'tomato', 'nope').preferred).not.toHaveProperty('tomato');
  });
  it('upsertStore adds or replaces in place', () => {
    const added = upsertStore(prefs(), { id: 'new', name: 'New', kind: 'maps-only', mapsQuery: 'q' });
    expect(added.stores.at(-1)?.id).toBe('new');
    const edited = upsertStore(prefs(), { ...alfatah, name: 'Al-Fatah 2' });
    expect(edited.stores[0].name).toBe('Al-Fatah 2');
    expect(edited.stores).toHaveLength(4);
  });
  it('resetStores restores the usual ones and drops choices for stores that are gone', () => {
    const withMine = upsertStore(prefs(), { id: 'mine', name: 'Mine', kind: 'maps-only', mapsQuery: 'q' });
    withMine.preferred.tomato = 'mine';
    const reset = resetStores(withMine, DEFAULT_STORES);
    expect(reset.stores).toEqual(DEFAULT_STORES);
    expect(reset.preferred).toEqual({ rice: 'alfatah', milk: 'pandamart', onion: 'local' });
  });
  it('preferredStore is null for Any store and for a missing store', () => {
    expect(preferredStore(prefs(), 'rice')?.id).toBe('alfatah');
    expect(preferredStore(prefs(), 'tomato')).toBeNull();
    expect(preferredStore({ ...prefs(), preferred: { rice: 'gone' } }, 'rice')).toBeNull();
  });
});

describe('groupByStore and list text', () => {
  const prefs: ShopPrefs = { ...defaultShopPrefs(), preferred: { rice: 'alfatah', milk: 'pandamart', onion: 'alfatah', ghost: 'removed-store' } };
  const lines = [
    { ingredientId: 'tomato', amountBase: 500 },
    { ingredientId: 'rice', amountBase: 1500 },
    { ingredientId: 'onion', amountBase: null },
    { ingredientId: 'milk', amountBase: 1000 },
    { ingredientId: 'ghost', amountBase: 3 },
  ];
  it('groups by preferred store with Any store last, aisle then name inside', () => {
    const g = groupByStore(lines, prefs, ings);
    expect(g.map(x => x.store?.id ?? null)).toEqual(['alfatah', 'pandamart', null]);
    expect(g[0].lines.map(l => l.ingredientId)).toEqual(['rice', 'onion']); // Pantry before Produce
  });
  it('a store that was deleted counts as Any store', () => {
    const g = groupByStore(lines, prefs, ings);
    expect(g.at(-1)?.lines.map(l => l.ingredientId)).toEqual(['ghost', 'tomato']);
  });
  it('leaves empty groups out and handles no lines', () => {
    expect(groupByStore([], prefs, ings)).toEqual([]);
    expect(groupByStore([{ ingredientId: 'rice', amountBase: 1 }], prefs, ings).map(g => g.store?.id)).toEqual(['alfatah']);
  });
  it('listText by store has store headings, amounts and check lines', () => {
    expect(listText(lines, ings, { groupBy: 'store', prefs })).toBe([
      'Al-Fatah', '- Rice - 1.5 kg', '- Onions (check)', '',
      'pandamart (foodpanda)', '- Milk - 1 L', '',
      'Any store', '- ghost (check)', '- Tomatoes - 500 g',
    ].join('\n'));
  });
  it('listText by aisle groups by aisle and shows the chosen store', () => {
    const text = listText(lines.slice(0, 4), ings, { groupBy: 'aisle', prefs });
    expect(text).toBe(['Dairy', '- Milk - 1 L [pandamart (foodpanda)]', '', 'Pantry', '- Rice - 1.5 kg [Al-Fatah]', '', 'Produce', '- Onions (check) [Al-Fatah]', '- Tomatoes - 500 g'].join('\n'));
  });
  it('listText is empty for no lines and treats zero as check', () => {
    expect(listText([], ings, { groupBy: 'store', prefs })).toBe('');
    expect(listText([{ ingredientId: 'rice', amountBase: 0 }], ings, { groupBy: 'aisle', prefs: defaultShopPrefs() })).toBe('Pantry\n- Rice (check)');
  });
  it('copyListText has the store items plus Any store items, not other stores', () => {
    const t = copyListText(lines.slice(0, 4), ings, panda, prefs);
    expect(t).toBe(['To buy for pandamart (foodpanda)', '- Milk - 1 L', '- Tomatoes - 500 g'].join('\n'));
    expect(t).not.toContain('Rice');
    expect(copyListText([{ ingredientId: 'rice', amountBase: 5 }], ings, panda, prefs)).toBe('');
  });
});
