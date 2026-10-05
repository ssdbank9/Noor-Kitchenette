import { describe, expect, it } from 'vitest';
import { parseEatOutList, placesForMood, type EatOutList } from './eatout';
import { I8_MARKAZ } from './geo';

const P = (name: string, extra: object = {}) => ({ name, rating: 4.5, reviews: 500, budget: 2, cuisines: ['Pizza'], url: null, ...extra });
const load = (places: unknown[]): EatOutList => {
  const r = parseEatOutList({ generatedAt: '2026-10-01T00:00:00Z', source: 't', moods: { Pizza: places } });
  if (!r.ok) throw new Error(r.error);
  return r.list;
};
const names = (l: EatOutList, order: 'rating' | 'nearest', home: typeof I8_MARKAZ | null) => placesForMood(l, 'Pizza', order, home).map(s => s.place.name);

describe('place coordinates', () => {
  it('keeps valid lat/lng and ignores distance and delivery fields', () => {
    const [p] = load([P('a', { lat: 33.7, lng: 73.1, distanceKm: 1.2, deliveryMinutes: 45 })]).moods.Pizza;
    expect([p.lat, p.lng]).toEqual([33.7, 73.1]);
    expect(JSON.stringify(p)).not.toMatch(/distance|deliver/i);
  });
  it('ignores missing, invalid, half and string coordinates but keeps the place', () => {
    const l = load([P('none'), P('big', { lat: 123, lng: 73 }), P('half', { lat: 33.7 }), P('str', { lat: '33.7', lng: '73.1' }), P('nan', { lat: null, lng: 'x' })]);
    expect(l.moods.Pizza.map(p => p.name)).toEqual(['none', 'big', 'half', 'str', 'nan']);
    for (const p of l.moods.Pizza) expect([p.lat, p.lng]).toEqual([null, null]);
  });
});

describe('nearest first', () => {
  const l = load([
    P('far', { lat: 33.75, lng: 73.1, rating: 4.9 }),
    P('nocoord-good', { rating: 4.8 }),
    P('near-low', { lat: 33.669, lng: 73.076, rating: 4.0 }),
    P('near-high', { lat: 33.669, lng: 73.076, rating: 4.7 }),
    P('nocoord-low', { rating: 3.5 }),
    P('mid', { lat: 33.7, lng: 73.075, rating: 4.2 }),
  ]);
  it('sorts by distance, ties by rating, places without coordinates last', () => {
    expect(names(l, 'nearest', I8_MARKAZ)).toEqual(['near-high', 'near-low', 'mid', 'far', 'nocoord-good', 'nocoord-low']);
  });
  it('gives distances only to places with coordinates', () => {
    const shown = placesForMood(l, 'Pizza', 'nearest', I8_MARKAZ);
    expect(shown.map(s => s.km === null)).toEqual([false, false, false, false, true, true]);
    expect(shown[2].km).toBeGreaterThan(3);
    expect(shown[2].km).toBeLessThan(4);
  });
  it('keeps the list order without a home area, or in rating mode', () => {
    const order = ['far', 'nocoord-good', 'near-low', 'near-high', 'nocoord-low', 'mid'];
    expect(names(l, 'nearest', null)).toEqual(order);
    expect(names(l, 'rating', I8_MARKAZ)).toEqual(order);
    expect(placesForMood(l, 'Pizza').every(s => s.km === null)).toBe(true);
  });
  it('sorts the whole mood before keeping ten', () => {
    const many = load(Array.from({ length: 25 }, (_, i) => P(`p${i}`, { lat: 33.668 + (25 - i) * 0.001, lng: 73.075 })));
    expect(names(many, 'nearest', I8_MARKAZ)[0]).toBe('p24');
    expect(names(many, 'nearest', I8_MARKAZ)).toHaveLength(10);
  });
});
