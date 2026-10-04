import { describe, expect, it } from 'vitest';
import { formatHouseholdDay, householdDate, householdMonth } from './localDate';

describe('household-local dates (D5)', () => {
  it('files a 1:30 a.m. meal on 1 October in Karachi under October, not September', () => {
    const instant = new Date('2026-10-01T01:30:00+05:00'); // 2026-09-30T20:30Z
    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-30'); // what v3 stored
    expect(householdDate(instant)).toBe('2026-10-01');
    expect(householdMonth(instant)).toBe('2026-10');
  });

  it('keeps late-evening meals on the same local day', () => {
    expect(householdDate(new Date('2026-10-04T23:59:00+05:00'))).toBe('2026-10-04');
  });

  it('formats the header date in the household time zone', () => {
    expect(formatHouseholdDay(new Date('2026-10-04T12:00:00+05:00'))).toBe('Sunday · 4 October');
  });
});

import { instantFromHousehold, nextSlot } from './localDate';

describe('household-local date and time to an instant', () => {
  it('turns 1:30 a.m. on 1 October in Karachi into the right UTC instant', () => {
    expect(instantFromHousehold('2026-10-01', '01:30').toISOString()).toBe('2026-09-30T20:30:00.000Z');
  });

  it('handles a zone with daylight saving', () => {
    expect(instantFromHousehold('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(instantFromHousehold('2026-12-01', '09:00', 'Europe/London').toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
});

describe('next meal slot', () => {
  const slots = { breakfast: '08:00', lunch: '13:30', chai: '17:00', dinner: '20:30' };
  it('suggests lunch late in the morning, dinner in the evening, breakfast after dinner', () => {
    expect(nextSlot('11:00', slots)).toBe('lunch');
    expect(nextSlot('14:30', slots)).toBe('lunch');
    expect(nextSlot('18:45', slots)).toBe('dinner');
    expect(nextSlot('23:30', slots)).toBe('breakfast');
  });
});
