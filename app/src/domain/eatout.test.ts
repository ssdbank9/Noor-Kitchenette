import { describe, expect, it } from 'vitest';
import {
  agoText, allMoods, buildFavourite, directionsUrl, isOld, loadEatOutList, parseEatOutList, parseEatOutText, pickNewest,
  placesForMood, priceLevelText, ratingText, rankSuggestions, suggestFavourite, suggestionReason, STORAGE_KEY, type EatOutList,
} from './eatout';
import type { Favourite } from './types';

const place = (name: string) => ({ name, rating: 4.9, reviews: 17302, budget: 2, cuisines: ['Pizza'], url: `https://foodpanda.pk/restaurant/x/${name}`, distanceKm: 1.2, deliveryMinutes: 45 });
const file = (generatedAt: string, moods: Record<string, unknown[]>) => ({ generatedAt, source: 'test', minReviews: 100, moods });
const list = (generatedAt: string, moods: Record<string, string[]>): EatOutList => {
  const r = parseEatOutList(file(generatedAt, Object.fromEntries(Object.entries(moods).map(([k, v]) => [k, v.map(place)]))));
  if (!r.ok) throw new Error(r.error);
  return r.list;
};
const fav = (id: string, dish: string, moods: string[], lastOrderedOn?: string): Favourite => ({ id, dish, place: 'P', moods, ...(lastOrderedOn ? { lastOrderedOn } : {}) });

describe('list validation', () => {
  it('refuses malformed files whole', () => {
    for (const bad of [null, 5, [], {}, { generatedAt: 'nope', moods: { A: [] } }, { generatedAt: '2026-10-01', moods: [] }, { generatedAt: '2026-10-01', moods: {} }, { generatedAt: '2026-10-01', moods: { Pizza: 'x' } }]) {
      expect(parseEatOutList(bad).ok).toBe(false);
    }
    expect(parseEatOutText('{not json').ok).toBe(false);
    expect(parseEatOutText('x'.repeat(1_100_000)).ok).toBe(false);
  });
  it('keeps https links only', () => {
    const r = parseEatOutList(file('2026-10-01T00:00:00Z', { Pizza: [
      { ...place('a'), url: 'http://foodpanda.pk/a' }, { ...place('b'), url: 'javascript:alert(1)' }, { ...place('c'), url: 'https://foodpanda.pk/c' },
    ] }));
    if (!r.ok) throw new Error(r.error);
    expect(r.list.moods.Pizza.map(p => p.url)).toEqual([null, null, 'https://foodpanda.pk/c']);
  });
  it('bounds numbers, drops unknown fields, caps long text and nameless places', () => {
    const r = parseEatOutList(file('2026-10-01T00:00:00Z', { Pizza: [
      { name: 'N'.repeat(500), rating: 9, reviews: -4, budget: 7, cuisines: Array(20).fill('C'.repeat(100)) },
      { rating: 4 },
    ] }));
    if (!r.ok) throw new Error(r.error);
    const [p] = r.list.moods.Pizza;
    expect(r.list.moods.Pizza).toHaveLength(1);
    expect(p.name).toHaveLength(80);
    expect([p.rating, p.reviews, p.budget]).toEqual([null, null, null]);
    expect(p.cuisines).toHaveLength(6);
    expect(p.cuisines[0]).toHaveLength(30);
    expect(JSON.stringify(p)).not.toMatch(/distance|deliver/i);
  });
});

describe('merge and loading', () => {
  it('newest generatedAt wins', () => {
    const a = list('2026-09-01T00:00:00Z', { Pizza: ['old'] });
    const b = list('2026-10-01T00:00:00Z', { Pizza: ['new'] });
    expect(pickNewest(a, b)).toBe(b);
    expect(pickNewest(b, a)).toBe(b);
    expect(pickNewest(null, a)).toBe(a);
    expect(pickNewest(null, null)).toBeNull();
  });
  it('merges the shipped file and the imported copy, and survives a missing file or broken storage', async () => {
    const shipped = JSON.stringify(file('2026-10-01T00:00:00Z', { Pizza: [place('s')] }));
    const imported = JSON.stringify(list('2026-10-03T00:00:00Z', { Pizza: ['i'] }));
    const ok = async () => new Response(shipped);
    const store = { getItem: (k: string) => (k === STORAGE_KEY ? imported : null) };
    expect((await loadEatOutList({ fetcher: ok, storage: store })).origin).toBe('imported');
    expect((await loadEatOutList({ fetcher: ok, storage: { getItem: () => null } })).origin).toBe('shipped');
    const missing = async () => new Response('<html>app</html>', { status: 200 });
    expect((await loadEatOutList({ fetcher: missing, storage: store })).origin).toBe('imported');
    const throws = async () => { throw new Error('offline'); };
    const brokenStore = { getItem: () => { throw new Error('blocked'); } };
    expect(await loadEatOutList({ fetcher: throws, storage: brokenStore })).toEqual({ list: null, origin: null });
  });
  it('knows when a list is old (after 30 days)', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    expect(isOld('2026-10-01T00:00:00Z', now)).toBe(false);
    expect(isOld('2026-09-29T00:00:00Z', now)).toBe(true);
  });
});

describe('mood filtering and text', () => {
  const l = list('2026-10-01T00:00:00Z', { Pizza: ['p1', 'p2'], Karahi: ['k1'], BBQ: [] });
  it('shows only that mood, at most 10', () => {
    expect(placesForMood(l, 'pizza').map(s => s.place.name)).toEqual(['p1', 'p2']);
    expect(placesForMood(l, 'Karahi').map(s => s.place.name)).toEqual(['k1']);
    expect(placesForMood(l, 'BBQ')).toEqual([]);
    expect(placesForMood(l, 'Pasta')).toEqual([]);
    expect(placesForMood(null, 'Pizza')).toEqual([]);
    const many = list('2026-10-01T00:00:00Z', { Pizza: Array.from({ length: 25 }, (_, i) => `p${i}`) });
    expect(placesForMood(many, 'Pizza')).toHaveLength(10);
  });
  it('price level is a category and never says "from Rs"', () => {
    expect(priceLevelText(1)).toBe('price level Rs');
    expect(priceLevelText(2)).toBe('price level Rs Rs');
    expect(priceLevelText(3)).toBe('price level Rs Rs Rs');
    expect(priceLevelText(null)).toBe('');
    for (const b of [1, 2, 3]) expect(priceLevelText(b)).not.toMatch(/from/i);
  });
  it('shows rating with review count', () => {
    expect(ratingText({ rating: 4.9, reviews: 17302 })).toBe('4.9 (17,302 reviews)');
  });
  it('adds mood words found on favourites', () => {
    const moods = allMoods([fav('1', 'x', ['pizza', 'Biryani'])]);
    expect(moods).toContain('Biryani');
    expect(moods.filter(m => m.toLowerCase() === 'pizza')).toHaveLength(1);
  });
});

describe('suggestions', () => {
  const a = fav('a', 'Alpha', ['Pizza'], '2026-09-14');
  const b = fav('b', 'Beta', ['Pizza'], '2026-10-03');
  const c = fav('c', 'Gamma', ['Karahi']);
  it('prefers never-ordered, then the longest ago', () => {
    expect(rankSuggestions([a, b, c], null).map(f => f.id)).toEqual(['c', 'a', 'b']);
  });
  it('prefers the selected mood and falls back to all', () => {
    expect(rankSuggestions([a, b, c], 'Pizza').map(f => f.id)).toEqual(['a', 'b']);
    expect(rankSuggestions([a, b, c], 'Burgers')).toHaveLength(3);
  });
  it('Show another rotates and wraps', () => {
    expect([0, 1, 2, 3].map(i => suggestFavourite([a, b], 'Pizza', i)?.id)).toEqual(['a', 'b', 'a', 'b']);
    expect(suggestFavourite([], null, 0)).toBeNull();
  });
  it('words the reason', () => {
    expect(suggestionReason(a, '2026-10-05')).toBe('Your favourite · last ordered 3 weeks ago');
    expect(suggestionReason(c, '2026-10-05')).toBe('Your favourite · not ordered yet');
    expect(agoText('2026-10-04', '2026-10-05')).toBe('yesterday');
    expect(agoText('2026-10-01', '2026-10-05')).toBe('4 days ago');
  });
});

describe('directions and favourite form', () => {
  it('encodes the place and area', () => {
    expect(directionsUrl('Café & Grill', 'F-7 Markaz')).toBe('https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20%26%20Grill%2C%20F-7%20Markaz');
    expect(directionsUrl('Only place')).toBe('https://www.google.com/maps/search/?api=1&query=Only%20place');
  });
  it('validates the favourite form', () => {
    const base = { dish: ' Fajita pizza ', place: 'Pizza Hut', area: '', url: '', moods: ['Pizza', 'pizza', ' '] };
    const ok = buildFavourite(base, 'f1');
    expect(ok).toMatchObject({ ok: true, favourite: { dish: 'Fajita pizza', place: 'Pizza Hut', moods: ['Pizza'] } });
    expect(buildFavourite({ ...base, dish: ' ' }, 'f1').ok).toBe(false);
    expect(buildFavourite({ ...base, url: 'http://x.pk' }, 'f1').ok).toBe(false);
    expect(buildFavourite({ ...base, url: 'javascript:alert(1)' }, 'f1').ok).toBe(false);
    const prev = fav('f1', 'd', [], '2026-10-01');
    expect(buildFavourite({ ...base, url: 'https://foodpanda.pk/r/1' }, 'f1', prev)).toMatchObject({ ok: true, favourite: { lastOrderedOn: '2026-10-01', url: 'https://foodpanda.pk/r/1' } });
  });
});
