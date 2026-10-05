import { describe, expect, it } from 'vitest';
import { makeEvent, reverse } from './ledger';
import { applyLeftover, newLeftover } from './leftovers';
import type { KitchenEvent } from './types';
import { wasteReport } from './waste';

const ev = (kind: KitchenEvent['kind'], delta: number, when: string, id: string, extra: object = {}) =>
  makeEvent(kind, [{ ingredientId: 'Tomato', delta, basis: 'measured', ...(kind === 'set-stock' ? { setTo: 3 } : {}) }], new Date(when), { id, ...extra });

const events = [
  ev('waste', -2, '2026-10-03T10:00:00+05:00', 'w1'),
  ev('waste', -1, '2026-09-25T10:00:00+05:00', 'w-sept'),
  ev('use', -1, '2026-10-02T10:00:00+05:00', 'u1'),
  ev('cook', -4, '2026-10-04T13:00:00+05:00', 'c1', { meal: { recipeId: 'R1', recipeVersion: 1, slot: 'lunch', servings: 4 } }),
  ev('set-stock', 2, '2026-10-05T09:00:00+05:00', 's1'),
  ev('set-stock', 0, '2026-10-05T09:30:00+05:00', 's2'),
  ev('purchase', 6, '2026-10-01T09:00:00+05:00', 'p1'),
];
const when = new Date('2026-10-04T10:00:00Z');
const lo = applyLeftover(applyLeftover(newLeftover({ id: 'l1', name: 'Daal', portions: 4, localDate: '2026-10-04', at: when }),
  { action: 'wasted', portions: 1, at: when, localDate: '2026-10-04' }),
  { action: 'used', portions: 2, at: when, localDate: '2026-10-04' });

describe('waste report', () => {
  const r = wasteReport(events, [lo], 'week', '2026-10-05');
  it('keeps the three sections apart', () => {
    expect(r.thrown.ingredients.map(x => x.eventId)).toEqual(['w1']);
    expect(r.usedUp.mealsCooked).toBe(1);
    expect(r.usedUp.everyday.map(x => x.eventId)).toEqual(['u1']);
    expect(r.usedUp.byIngredient).toEqual([{ ingredientId: 'Tomato', amount: 5 }]);
    expect(r.corrections).toMatchObject({ checks: 2, changed: 1 });
    expect(r.corrections.entries.map(x => x.eventId).sort()).toEqual(['s1', 's2']);
    const ids = [...r.thrown.ingredients, ...r.usedUp.everyday, ...r.corrections.entries].map(x => x.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('counts leftover portions wasted from the log only: eaten ones are not waste', () => {
    expect(r.thrown.leftovers).toEqual([{ leftoverId: 'l1', name: 'Daal', localDate: '2026-10-04', portions: 1 }]);
    expect(r.thrown.leftoverPortions).toBe(1);
    expect(wasteReport([], [{ ...lo, log: lo.log.filter(e => e.kind !== 'wasted') }], 'week', '2026-10-05').thrown.leftovers).toEqual([]);
  });
  it('respects the month boundary and the period', () => {
    expect(wasteReport(events, [], 'month', '2026-10-05').thrown.ingredients.map(x => x.eventId)).toEqual(['w1']);
    expect(wasteReport(events, [], 'month', '2026-09-30').thrown.ingredients.map(x => x.eventId)).toEqual(['w-sept']);
    expect(wasteReport(events, [], 'year', '2026-10-05').thrown.ingredients.map(x => x.eventId).sort()).toEqual(['w-sept', 'w1']);
    expect(wasteReport(events, [lo], 'week', '2026-10-20').thrown.leftovers).toEqual([]);
  });
  it('leaves out undone events and sample-pantry loads', () => {
    const undone = [...events, reverse(events[0], events, new Date('2026-10-05T10:00:00Z'))];
    expect(wasteReport(undone, [], 'week', '2026-10-05').thrown.ingredients).toEqual([]);
    const sample = [ev('set-stock', 9, '2026-10-05T09:00:00+05:00', 'sample-Tomato-x')];
    expect(wasteReport(sample, [], 'week', '2026-10-05').corrections.checks).toBe(0);
  });
});
