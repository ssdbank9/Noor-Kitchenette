import { describe, expect, it } from 'vitest';
import { assertNoHomeLocation, placeCoords, publicList, publicUrl } from '../../../tools/eatout/publish.mjs';

const HOME = { lat: 33.668, lng: 73.075 }; // I-8 Markaz, the public search centre
const local = (places: object[]) => ({ generatedAt: '2026-10-05T08:00:00.000Z', source: 'test', minReviews: 100, moods: { Pizza: places } });
const vendor = (extra: object = {}) => ({
  name: 'Pizza One', rating: 4.7, reviews: 900, budget: 2, cuisines: ['Pizza'],
  url: 'https://foodpanda.pk/restaurant/abc/pizza-one?lat=33.668&lng=73.075#x',
  distanceKm: 1.2, deliveryMinutes: 45, lat: 33.70123456, lng: 73.04987654, ...extra,
});

describe('placeCoords', () => {
  it('rounds to 4 decimals and ignores missing or invalid values', () => {
    expect(placeCoords(33.70123456, 73.04987654)).toEqual({ lat: 33.7012, lng: 73.0499 });
    expect(placeCoords('33.7', '73.1')).toEqual({ lat: 33.7, lng: 73.1 });
    for (const [a, b] of [[undefined, 73], [33, null], [95, 73], [33, 200], [NaN, 1], ['', ''], ['x', 'y']]) expect(placeCoords(a, b)).toEqual({});
  });
});

describe('publicList', () => {
  it('keeps restaurant lat/lng and drops distance, delivery time and link queries', () => {
    const out = publicList(local([vendor()]), HOME);
    const [p] = out.moods.Pizza;
    expect(p.lat).toBe(33.7012);
    expect(p.lng).toBe(73.0499);
    expect(p.url).toBe('https://foodpanda.pk/restaurant/abc/pizza-one');
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/distance|deliver/i);
    expect(text).not.toMatch(/33\.668|73\.075/);
  });
  it('leaves a place without coordinates without lat/lng', () => {
    const [p] = publicList(local([vendor({ lat: undefined, lng: undefined })]), HOME).moods.Pizza;
    expect('lat' in p || 'lng' in p).toBe(false);
  });
  it('refuses a list that contains the home coordinates', () => {
    expect(() => publicList(local([vendor({ lat: 33.668, lng: 73.5 })]), HOME)).toThrow(/home/);
    expect(() => publicList(local([vendor({ lat: 33.5, lng: 73.075 })]), HOME)).toThrow(/home/);
  });
  it('refuses home-like keys but allows a restaurant lat/lng', () => {
    expect(() => assertNoHomeLocation('{"lat":33.7,"lng":73.04}', HOME)).not.toThrow();
    for (const k of ['latitude', 'longitude', 'homeLat', 'home', 'centre', 'searchLat', 'origin']) {
      expect(() => assertNoHomeLocation(`{"${k}":1}`, HOME)).toThrow(/location key/);
    }
  });
  it('catches the home value anywhere in the text, such as inside a link', () => {
    expect(() => assertNoHomeLocation('{"url":"https://x.pk/a/33.668/b"}', HOME)).toThrow(/home/);
  });
});

describe('publicUrl', () => {
  it('keeps https only and strips query and fragment', () => {
    expect(publicUrl('https://a.pk/x?y=1#z')).toBe('https://a.pk/x');
    expect(publicUrl('http://a.pk/x')).toBeNull();
    expect(publicUrl('nope')).toBeNull();
    expect(publicUrl(null)).toBeNull();
  });
});
