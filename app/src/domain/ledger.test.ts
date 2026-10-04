import { describe, expect, it } from 'vitest';
import {
  activeEvents,
  balances,
  cookingHistory,
  inPantry,
  lastCooked,
  makeEvent,
  monthSummary,
  reverse,
} from './ledger';
import type { KitchenEvent, MealRecord } from './types';

const at = (iso: string) => new Date(iso);
const karahi: MealRecord = { recipeId: 'R004', recipeVersion: 1, slot: 'lunch', servings: 5 };

function buyChicken(grams: number, when = '2026-10-02T10:00:00+05:00'): KitchenEvent {
  return makeEvent('purchase', [{ ingredientId: 'Chicken', delta: grams, basis: 'measured' }], at(when), { id: 'buy-chicken' });
}

function cookKarahi(when = '2026-10-04T13:30:00+05:00'): KitchenEvent {
  return makeEvent(
    'cook',
    [
      { ingredientId: 'Chicken', delta: -1000, basis: 'measured' },
      { ingredientId: 'Tomato', delta: -6, basis: 'measured' },
    ],
    at(when),
    { id: 'cook-karahi', meal: karahi, source: 'recipe' },
  );
}

describe('balances', () => {
  it('adds purchases and subtracts cooking', () => {
    const events = [buyChicken(1500), cookKarahi()];
    expect(balances(events).get('Chicken')?.amount).toBe(500);
  });

  it('never shows negative stock', () => {
    const events = [buyChicken(500), cookKarahi()];
    expect(balances(events).get('Chicken')?.amount).toBe(0);
  });

  it('treats "set remaining amount" as the new starting point, even if an older purchase is undone', () => {
    const buy = buyChicken(1500);
    const set = makeEvent('set-stock', [{ ingredientId: 'Chicken', delta: -1200, basis: 'measured', setTo: 300 }],
      at('2026-10-03T09:00:00+05:00'), { id: 'set-chicken' });
    const undoBuy = reverse(buy, [buy, set], at('2026-10-03T10:00:00+05:00'));
    expect(balances([buy, set, undoBuy]).get('Chicken')?.amount).toBe(300);
  });

  it('keeps "not sure" as unknown, never zero', () => {
    const set = makeEvent('set-stock', [{ ingredientId: 'Green_Chilli', delta: 0, basis: 'unknown', setTo: null }],
      at('2026-10-03T09:00:00+05:00'));
    const b = balances([set]).get('Green_Chilli');
    expect(b?.amount).toBeNull();
    expect(b?.basis).toBe('unknown');
    expect(inPantry(b)).toBe('maybe');
  });

  it('marks a balance as an estimate once any estimated amount went into it', () => {
    const seed = makeEvent('set-stock', [{ ingredientId: 'Chicken', delta: 1000, basis: 'estimate', setTo: 1000 }], at('2026-10-01T05:00:00+05:00'));
    const buy = buyChicken(500);
    expect(balances([seed, buy]).get('Chicken')).toMatchObject({ amount: 1500, basis: 'estimate' });
  });
});

describe('undo reverses every effect (D3)', () => {
  it('restores stock AND removes the meal from history and the monthly totals', () => {
    const buy = buyChicken(1500);
    const cook = cookKarahi();
    const before = [buy, cook];
    expect(cookingHistory(before)).toHaveLength(1);
    expect(monthSummary(before, '2026-10').meals).toBe(1);

    const undo = reverse(cook, before, at('2026-10-04T14:00:00+05:00'));
    const after = [...before, undo];
    expect(balances(after).get('Chicken')?.amount).toBe(1500);
    expect(cookingHistory(after)).toHaveLength(0);
    expect(monthSummary(after, '2026-10')).toMatchObject({ meals: 0, servings: 0 });
    expect(lastCooked(after).has('R004')).toBe(false);
  });

  it('refuses to undo the same entry twice', () => {
    const cook = cookKarahi();
    const undo = reverse(cook, [cook], at('2026-10-04T14:00:00+05:00'));
    expect(() => reverse(cook, [cook, undo], at('2026-10-04T14:05:00+05:00'))).toThrow(/already been undone/);
  });

  it('can redo by undoing the undo', () => {
    const buy = buyChicken(1500);
    const cook = cookKarahi();
    const undo = reverse(cook, [buy, cook], at('2026-10-04T14:00:00+05:00'));
    const redo = reverse(undo, [buy, cook, undo], at('2026-10-04T14:01:00+05:00'));
    const events = [buy, cook, undo, redo];
    expect(balances(events).get('Chicken')?.amount).toBe(500);
    expect(cookingHistory(events)).toHaveLength(1);
    expect(activeEvents(events).map(e => e.id)).toEqual(['buy-chicken', 'cook-karahi']);
  });
});

describe('"in the pantry" is derived from stock (D4)', () => {
  it('shows nothing in the pantry after a purchase on an empty pantry is undone', () => {
    const buyEggs = makeEvent('purchase', [{ ingredientId: 'Egg', delta: 12, basis: 'measured' }], at('2026-10-04T11:00:00+05:00'));
    expect(inPantry(balances([buyEggs]).get('Egg'))).toBe('yes');
    const undo = reverse(buyEggs, [buyEggs], at('2026-10-04T11:01:00+05:00'));
    const b = balances([buyEggs, undo]).get('Egg');
    expect(b?.amount ?? 0).toBe(0);
    expect(inPantry(b)).toBe('no');
  });
});

describe('household-local dates in history (D5)', () => {
  it('counts a 1:30 a.m. meal on 1 October in Karachi in October', () => {
    const lateNight = makeEvent('cook', [], at('2026-09-30T20:30:00Z'), { meal: { ...karahi, slot: 'dinner' } });
    expect(lateNight.localDate).toBe('2026-10-01');
    expect(lateNight.localTime).toBe('01:30');
    expect(monthSummary([lateNight], '2026-10').meals).toBe(1);
    expect(monthSummary([lateNight], '2026-09').meals).toBe(0);
  });

  it('totals meals by slot and by dish, most cooked first', () => {
    const mk = (id: string, recipeId: string, slot: MealRecord['slot'], iso: string) =>
      makeEvent('cook', [], at(iso), { id, meal: { recipeId, recipeVersion: 1, slot, servings: 4 } });
    const events = [
      mk('a', 'R006b', 'lunch', '2026-10-01T13:00:00+05:00'),
      mk('b', 'R006b', 'dinner', '2026-10-02T20:00:00+05:00'),
      mk('c', 'R004', 'lunch', '2026-10-03T13:00:00+05:00'),
    ];
    const s = monthSummary(events, '2026-10');
    expect(s).toMatchObject({ meals: 3, servings: 12, bySlot: { breakfast: 0, lunch: 2, dinner: 1, chai: 0 } });
    expect(s.byRecipe).toEqual([{ recipeId: 'R006b', count: 2 }, { recipeId: 'R004', count: 1 }]);
    expect(lastCooked(events).get('R006b')).toBe('2026-10-02');
  });
});
