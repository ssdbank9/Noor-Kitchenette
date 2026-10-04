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
