import { describe, expect, it } from 'vitest';
import { addDays, cookingHistory, dishName, makeEvent, monthSummary, notCookedInAWhile, periodSummary, rangeDates, reverse } from './ledger';
import type { KitchenEvent, MealRecord } from './types';

const at = (iso: string) => new Date(iso);
let n = 0;
function cook(date: string, recipeId = 'R1', extra: Partial<MealRecord> = {}, slot: MealRecord['slot'] = 'lunch', servings = 4): KitchenEvent {
  return makeEvent('cook', [], at(`${date}T13:00:00+05:00`), { id: `c${++n}`, meal: { recipeId, recipeVersion: 1, slot, servings, ...extra } });
}

describe('addDays and rangeDates', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('week is the last 7 local days ending today, month and year are calendar periods', () => {
    expect(rangeDates('week', '2026-10-04')).toEqual({ startDate: '2026-09-28', endDate: '2026-10-04' });
    expect(rangeDates('week', '2026-10-02')).toEqual({ startDate: '2026-09-26', endDate: '2026-10-02' });
    expect(rangeDates('month', '2026-10-04')).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(rangeDates('year', '2026-10-04')).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
  });
});

describe('periodSummary', () => {
  const events = [
    cook('2026-09-27', 'R1'), // just before the week
    cook('2026-09-28', 'R1'), // first day of the week
    cook('2026-09-30', 'R2', {}, 'dinner', 2),
    cook('2026-10-01', 'R2', {}, 'dinner', 3), // first day of October
    cook('2026-10-04', 'R1'),
    cook('2025-12-31', 'R3'),
  ];
  it('counts both end dates and nothing outside them', () => {
    const w = periodSummary(events, '2026-09-28', '2026-10-04');
    expect(w).toMatchObject({ meals: 4, servings: 4 + 2 + 3 + 4, bySlot: { lunch: 2, dinner: 2 } });
  });
  it('the month boundary: 30 September is not October, 1 October is', () => {
    expect(monthSummary(events, '2026-10')).toMatchObject({ month: '2026-10', meals: 2 });
    expect(monthSummary(events, '2026-09')).toMatchObject({ meals: 3 });
    const { startDate, endDate } = rangeDates('month', '2026-10-04');
    expect(periodSummary(events, startDate, endDate).meals).toBe(2);
  });
  it('year covers this calendar year only', () => {
    const { startDate, endDate } = rangeDates('year', '2026-10-04');
    expect(periodSummary(events, startDate, endDate).meals).toBe(5);
  });
  it('undone meals are not counted, and byRecipe keeps the newest written name', () => {
    const a = cook('2026-10-02', 'U-1', { recipeName: 'Old name' });
    const b = cook('2026-10-03', 'U-1', { recipeName: 'New name' });
    const c = cook('2026-10-03', 'U-2');
    const undone = reverse(c, [a, b, c], at('2026-10-03T20:00:00+05:00'));
    expect(periodSummary([a, b, c, undone], '2026-10-01', '2026-10-31').byRecipe).toEqual([{ recipeId: 'U-1', count: 2, recipeName: 'New name' }]);
  });
});

describe('notCookedInAWhile (14 days)', () => {
  const today = '2026-10-15';
  it('lists dishes whose last meal is 14 or more days ago, oldest first, never ones cooked within 14 days', () => {
    const events = [
      cook('2026-10-01', 'old14'), // 14 days ago: in
      cook('2026-10-02', 'new13'), // 13 days ago: out
      cook('2026-09-01', 'older'),
      cook('2026-09-02', 'older'), // the last time counts, not the first
      cook('2026-10-15', 'today'),
    ];
    expect(notCookedInAWhile(events, today)).toEqual([
      { recipeId: 'older', lastDate: '2026-09-02' },
      { recipeId: 'old14', lastDate: '2026-10-01' },
    ]);
  });
  it('a dish cooked again recently drops out, and never-cooked dishes are not listed', () => {
    expect(notCookedInAWhile([cook('2026-08-01', 'x'), cook('2026-10-14', 'x')], today)).toEqual([]);
    expect(notCookedInAWhile([], today)).toEqual([]);
  });
  it('shows at most 5, skips dishes that no longer exist, and an undone meal does not count', () => {
    const events = ['a', 'b', 'c', 'd', 'e', 'f', 'gone'].map((id, i) => cook(`2026-08-0${i + 1}`, id));
    const exists = (id: string) => id !== 'gone';
    expect(notCookedInAWhile(events, today, exists).map(l => l.recipeId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const fresh = cook('2026-10-14', 'a');
    const undo = reverse(fresh, [...events, fresh], at('2026-10-14T20:00:00+05:00'));
    expect(notCookedInAWhile([...events, fresh, undo], today, exists)[0].recipeId).toBe('a');
    expect(notCookedInAWhile([...events, fresh], today, exists)[0].recipeId).toBe('b');
  });
});

describe('history keeps its words (F77)', () => {
  it('uses the name written on the meal, then the current recipe, then the id', () => {
    const byId = new Map([['R1', { name: 'Current name' }]]);
    expect(dishName({ recipeId: 'U-1', recipeName: 'Written then' }, byId)).toBe('Written then');
    expect(dishName({ recipeId: 'R1' }, byId)).toBe('Current name');
    expect(dishName({ recipeId: 'U-gone' }, byId)).toBe('U-gone');
  });
  it('a meal of a deleted recipe is still in the history with its name', () => {
    const e = cook('2026-10-03', 'U-deleted', { recipeName: 'My test dish' });
    const [m] = cookingHistory([e]);
    expect(dishName(m.meal, new Map())).toBe('My test dish');
  });
});
