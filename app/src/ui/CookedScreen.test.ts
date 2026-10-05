import { describe, expect, it } from 'vitest';
import { lastSevenDays } from './CookedScreen';

describe('date strip on "I cooked it" (F82)', () => {
  it('shows the last seven local days ending today, across a month boundary', () => {
    const days = lastSevenDays('2026-10-04');
    expect(days.map(d => d.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(days[0].weekday).toBe('Mon');
    expect(days[6]).toMatchObject({ weekday: 'Sun', day: 4 });
  });
});
