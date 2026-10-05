import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistance, I8_MARKAZ, isLat, isLng, round3, validLatLng } from './geo';

describe('distanceKm (haversine)', () => {
  it('is 0 to itself and symmetric', () => {
    expect(distanceKm(I8_MARKAZ, I8_MARKAZ)).toBe(0);
    const f7 = { lat: 33.7215, lng: 73.0565 };
    expect(distanceKm(I8_MARKAZ, f7)).toBeCloseTo(distanceKm(f7, I8_MARKAZ), 9);
  });
  it('matches known distances', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1); // one degree on the equator
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.1, 0); // half the earth
    const f7 = distanceKm(I8_MARKAZ, { lat: 33.7215, lng: 73.0565 }); // F-7 Markaz
    expect(f7).toBeGreaterThan(4);
    expect(f7).toBeLessThan(7);
  });
  it('handles the antimeridian and the poles', () => {
    expect(distanceKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo(111.19, 1);
    expect(distanceKm({ lat: 90, lng: 0 }, { lat: 90, lng: 120 })).toBeCloseTo(0, 6);
  });
});

describe('formatDistance', () => {
  it('uses one decimal under 10 km and whole numbers above', () => {
    expect(formatDistance(0.04)).toBe('~0.0 km');
    expect(formatDistance(0.4)).toBe('~0.4 km');
    expect(formatDistance(0.96)).toBe('~1.0 km');
    expect(formatDistance(2.1)).toBe('~2.1 km');
    expect(formatDistance(9.94)).toBe('~9.9 km');
    expect(formatDistance(9.96)).toBe('~10 km');
    expect(formatDistance(10.4)).toBe('~10 km');
    expect(formatDistance(11.6)).toBe('~12 km');
    expect(formatDistance(12.3)).toBe('~12 km');
  });
  it('shows nothing for a nonsense distance', () => {
    expect(formatDistance(NaN)).toBe('');
    expect(formatDistance(-1)).toBe('');
    expect(formatDistance(Infinity)).toBe('');
  });
});

describe('coordinate validation', () => {
  it('accepts finite numbers in range, edges included', () => {
    expect(validLatLng(33.668, 73.075)).toEqual({ lat: 33.668, lng: 73.075 });
    expect(validLatLng(-90, -180)).toEqual({ lat: -90, lng: -180 });
    expect(validLatLng(90, 180)).toEqual({ lat: 90, lng: 180 });
    expect(validLatLng(0, 0)).toEqual({ lat: 0, lng: 0 });
  });
  it('refuses out of range, non-finite and non-number values', () => {
    for (const [a, b] of [[90.01, 0], [-90.01, 0], [0, 180.01], [0, -180.01], [NaN, 0], [0, Infinity], ['33.6', 73], [33, '73'], [null, 1], [undefined, undefined], [{}, []]]) {
      expect(validLatLng(a, b)).toBeNull();
    }
    expect(isLat(91)).toBe(false);
    expect(isLng(-181)).toBe(false);
  });
  it('rounds a position to 3 decimals', () => {
    expect(round3(33.66849)).toBe(33.668);
    expect(round3(73.0756)).toBe(73.076);
  });
});
