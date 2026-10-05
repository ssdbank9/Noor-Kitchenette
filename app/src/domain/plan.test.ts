import { describe, expect, it } from 'vitest';
import { effectiveIds, makeEvent, reverse } from './ledger';
import {
  addDish, addEatOut, addLeftover, applyProposal, cancelMeal, competition, competitionOnDate, cooksAtHome, isCooked,
  markLeftoverUsed, mealsFor, newMeal, pendingDishes, plannedHero, removeItem, restoreMeal, setCooked, setServings,
  slotStillToday, suggestWeek, swapDish, weekDates, cleanLabel,
} from './plan';
import { baseEvents, daal, ingredients, karahi, meal, pulao, recipes, stockFor, stockEvent } from './planTestKit';
import { toBase } from './units';
import { seed } from '../data/seed';
import { exportBackup, parseBackup } from '../storage/backup';
import type { Leftover, PlannedMeal } from './types';

const TODAY = '2026-10-05';
const recipesById = new Map(recipes.map(r => [r.id, r]));

describe('week helpers', () => {
  it('weekDates gives seven consecutive days, across a month end', () => {
    expect(weekDates('2026-10-29')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  });
  it('mealsFor lists a day in slot order, or one slot', () => {
    const plan = [meal('d', TODAY, 'dinner', ['K']), meal('l', TODAY, 'lunch', ['P']), meal('x', '2026-10-06', 'lunch', ['D'])];
    expect(mealsFor(plan, TODAY).map(m => m.id)).toEqual(['l', 'd']);
    expect(mealsFor(plan, TODAY, 'dinner')?.id).toBe('d');
    expect(mealsFor(plan, TODAY, 'breakfast')).toBeUndefined();
  });
  it('slotStillToday allows 90 minutes of grace', () => {
    expect(slotStillToday('13:30', '14:50')).toBe(true);
    expect(slotStillToday('13:30', '15:10')).toBe(false);
  });
});

describe('meal edits', () => {
  const m0 = newMeal('m', TODAY, 'lunch', 4);
  it('adds several dishes to one meal, but not the same uncooked dish twice', () => {
    const m = addDish(addDish(addDish(m0, karahi), daal), karahi);
    expect(m.items.map(i => (i.kind === 'dish' ? i.recipeId : ''))).toEqual(['K', 'D']);
    expect(m0.items).toEqual([]); // never mutates
  });
  it('removes and swaps dishes', () => {
    const m = addDish(addDish(m0, karahi), daal);
    expect(removeItem(m, 0).items).toHaveLength(1);
    const swapped = swapDish(m, 0, pulao);
    expect(swapped.items[0]).toMatchObject({ recipeId: 'P', recipeName: 'Pulao' });
    expect(swapped.items[1]).toMatchObject({ recipeId: 'D' });
  });
  it('never swaps a cooked dish', () => {
    const cooked = setCooked(addDish(m0, karahi), 0, 'e1');
    expect(swapDish(cooked, 0, pulao)).toBe(cooked);
  });
  it('sets servings within 1 to 30', () => {
    expect(setServings(m0, 6).servings).toBe(6);
    expect(setServings(m0, 0).servings).toBe(1);
    expect(setServings(m0, 99).servings).toBe(30);
  });
  it('cancels and restores a meal without losing its items', () => {
    const m = addDish(m0, karahi);
    const c = cancelMeal(m);
    expect(c.status).toBe('cancelled');
    expect(c.items).toEqual(m.items);
    expect(restoreMeal(c)).toEqual(m);
  });
  it('adds eating out as plain text, one per meal', () => {
    const m = addEatOut(addEatOut(m0, 'Kolachi  <b>tonight</b>\n'), 'Cafe');
    expect(m.items).toEqual([{ kind: 'eatout', label: 'Cafe' }]);
    expect(cleanLabel(' a\u0000b\n c ')).toBe('a b c');
    expect(addEatOut(m0, '').items).toEqual([{ kind: 'eatout', label: '' }]);
  });
  it('adds a planned leftover with portions clamped to what is left', () => {
    const l = { id: 'l1', name: 'Daal', portionsLeft: 3 };
    expect(addLeftover(m0, l, 2).items[0]).toEqual({ kind: 'leftover', leftoverId: 'l1', label: 'Daal', portions: 2 });
    expect(addLeftover(m0, l, 9).items[0]).toMatchObject({ portions: 3 });
    expect(addLeftover(m0, l, 0).items[0]).toMatchObject({ portions: 1 });
  });
  it('marks a leftover item eaten', () => {
    const m = markLeftoverUsed(addLeftover(m0, { id: 'l1', name: 'Daal', portionsLeft: 3 }, 2), 0, TODAY);
    expect(m.items[0]).toMatchObject({ usedOn: TODAY });
  });
});

describe('isCooked', () => {
  it('follows the cook event: undoing the cook un-cooks the dish', () => {
    const cook = makeEvent('cook', [], new Date('2026-10-05T08:00:00Z'), { id: 'c1' });
    const m = setCooked(addDish(newMeal('m', TODAY, 'lunch', 4), karahi), 0, 'c1');
    const item = m.items[0];
    expect(isCooked(item, [cook])).toBe(true);
    const undo = reverse(cook, [cook], new Date('2026-10-05T09:00:00Z'));
    expect(isCooked(item, [cook, undo])).toBe(false);
    const redo = reverse(undo, [cook, undo], new Date('2026-10-05T10:00:00Z'));
    expect(isCooked(item, effectiveIds([cook, undo, redo]))).toBe(true);
  });
  it('is false with no event, and for non-dish items', () => {
    const m = addEatOut(addDish(newMeal('m', TODAY, 'lunch', 4), karahi), 'x');
    expect(isCooked(m.items[0], [])).toBe(false);
    expect(isCooked(m.items[1], [])).toBe(false);
    expect(isCooked(setCooked(m, 0, 'ghost').items[0], [])).toBe(false);
  });
});

describe('pendingDishes and meals that cook at home', () => {
  it('skips cancelled, eating-out, past and cooked meals', () => {
    const cook = makeEvent('cook', [], new Date('2026-10-05T08:00:00Z'), { id: 'c1' });
    const plan: PlannedMeal[] = [
      meal('past', '2026-10-04', 'dinner', ['K']),
      cancelMeal(meal('cancelled', TODAY, 'lunch', ['K'])),
      addEatOut(meal('out', TODAY, 'dinner', ['K']), 'Cafe'),
      setCooked(meal('done', '2026-10-06', 'lunch', ['K']), 0, 'c1'),
      meal('keep', '2026-10-06', 'dinner', ['P', 'D']),
    ];
    expect(pendingDishes(plan, recipesById, TODAY, [cook]).map(p => `${p.meal.id}:${p.recipe.id}`)).toEqual(['keep:P', 'keep:D']);
    expect(cooksAtHome(plan[1])).toBe(false);
    expect(cooksAtHome(plan[2])).toBe(false);
  });
});

describe('competition', () => {
  const run = (plan: PlannedMeal[], events = baseEvents()) =>
    competition(plan, recipes, stockFor(events), ingredients, toBase, TODAY, events);

  it('is quiet when stock covers every planned meal', () => {
    expect(run([meal('a', TODAY, 'lunch', ['K'])])).toEqual([]);
  });
  it('names the meals that compete for chicken: 2 kg needed, 1.5 kg in stock', () => {
    const plan = [meal('b', '2026-10-06', 'dinner', ['P']), meal('a', TODAY, 'lunch', ['K'])];
    const c = run(plan);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ ingredientId: 'Chicken', need: 2000, have: 1500, short: 500 });
    // date/slot order, not insertion order
    expect(c[0].meals.map(m => `${m.localDate}:${m.recipeName}`)).toEqual([`${TODAY}:Karahi`, '2026-10-06:Pulao']);
    expect(competitionOnDate(c, '2026-10-06')).toHaveLength(1);
    expect(competitionOnDate(c, '2026-10-07')).toEqual([]);
  });
  it('scales by the meal servings', () => {
    const big = { ...meal('a', TODAY, 'lunch', ['K']), servings: 8 };
    expect(run([big])[0]).toMatchObject({ ingredientId: 'Chicken', need: 2000 });
  });
  it('ignores cancelled, eating-out, cooked and past meals', () => {
    const cook = makeEvent('cook', [], new Date('2026-10-05T08:00:00Z'), { id: 'c1' });
    const plan = [
      meal('a', TODAY, 'lunch', ['K']),
      cancelMeal(meal('b', TODAY, 'dinner', ['P'])),
      addEatOut(meal('c', '2026-10-06', 'lunch', ['P']), 'Cafe'),
      setCooked(meal('d', '2026-10-06', 'dinner', ['P']), 0, 'c1'),
      meal('e', '2026-10-01', 'dinner', ['P']),
    ];
    expect(run(plan, [...baseEvents(), cook])).toEqual([]);
  });
  it('does not judge stock that is not sure', () => {
    const events = [...baseEvents(), stockEvent('s9', 'Chicken', null)];
    expect(run([meal('a', TODAY, 'lunch', ['K']), meal('b', TODAY, 'dinner', ['P'])], events)).toEqual([]);
  });
  it('ignores amounts it cannot convert instead of guessing', () => {
    expect(run([meal('a', TODAY, 'lunch', ['O'])])).toEqual([]);
  });
});

describe('plannedHero', () => {
  it('returns uncooked dishes, eating out, or nothing', () => {
    const cook = makeEvent('cook', [], new Date('2026-10-05T08:00:00Z'), { id: 'c1' });
    const two = setCooked(meal('m', TODAY, 'lunch', ['K', 'D']), 0, 'c1');
    const h = plannedHero([two], TODAY, 'lunch', [cook]);
    expect(h).toMatchObject({ kind: 'dish', dishes: [{ index: 1, recipeId: 'D' }] });
    expect(plannedHero([two], TODAY, 'lunch', [])).toMatchObject({ kind: 'dish', dishes: [{ index: 0 }, { index: 1 }] });
    expect(plannedHero([cancelMeal(two)], TODAY, 'lunch', [])).toBeNull();
    expect(plannedHero([addEatOut(two, 'Cafe')], TODAY, 'lunch', [])).toMatchObject({ kind: 'eatout', label: 'Cafe' });
    expect(plannedHero([two], TODAY, 'dinner', [])).toBeNull();
  });
});

describe('suggestWeek', () => {
  const input = (over: Partial<Parameters<typeof suggestWeek>[0]> = {}) => ({
    plan: [] as PlannedMeal[], recipes, events: baseEvents(), ingredients, toBase, today: TODAY, servings: 4, ...over,
  });

  it('proposes dishes for lunch and dinner over 7 days and saves nothing', () => {
    const plan: PlannedMeal[] = [];
    const events = baseEvents();
    const out = suggestWeek(input({ plan, events }));
    expect(out.length).toBeGreaterThan(0);
    expect(new Set(out.map(p => p.slot))).toEqual(new Set(['lunch', 'dinner']));
    expect(out.every(p => p.localDate >= TODAY && p.localDate <= '2026-10-11')).toBe(true);
    expect(plan).toEqual([]);
    expect(events).toHaveLength(baseEvents().length);
  });
  it('never repeats a dish within 3 days', () => {
    const out = suggestWeek(input());
    for (const a of out) for (const b of out) {
      if (a === b || a.recipeId !== b.recipeId) continue;
      expect(Math.abs(Date.parse(a.localDate) - Date.parse(b.localDate)) / 86_400_000).toBeGreaterThanOrEqual(3);
    }
  });
  it('counts dishes already planned for variety', () => {
    const plan = [meal('m', TODAY, 'lunch', ['D'])];
    const out = suggestWeek(input({ plan }));
    expect(out.filter(p => p.recipeId === 'D' && p.localDate < '2026-10-08')).toEqual([]);
  });
  it('uses stock cumulatively: only one chicken dish is "ready" with 1.5 kg of chicken', () => {
    const out = suggestWeek(input({ recipes: [karahi, pulao], plan: [] }));
    expect(out.filter(p => p.status === 'ready')).toHaveLength(1);
    expect(out.length).toBeGreaterThan(1);
    expect(out.slice(1).every(p => p.status !== 'ready')).toBe(true);
  });
  it('prefers a dish that can be made over one that cannot', () => {
    const noChicken = [...baseEvents(), stockEvent('s9', 'Chicken', 0)];
    const out = suggestWeek(input({ events: noChicken, days: 1 }));
    expect(out[0].recipeId).toBe('D');
    expect(out[0].status).toBe('ready');
  });
  it('skips filled and cancelled slots and respects the exclude list', () => {
    const plan = [meal('a', TODAY, 'lunch', ['D']), cancelMeal(newMeal('b', TODAY, 'dinner', 4))];
    expect(suggestWeek(input({ plan, days: 1 }))).toEqual([]);
    const free = suggestWeek(input({ days: 1, slots: ['lunch'] }));
    const again = suggestWeek(input({ days: 1, slots: ['lunch'], exclude: new Map([[`${TODAY}|lunch`, new Set([free[0].recipeId])]]) }));
    expect(again[0].recipeId).not.toBe(free[0].recipeId);
  });
  it('turns a proposal into a meal only when applied', () => {
    const p = suggestWeek(input({ days: 1, slots: ['lunch'] }))[0];
    const m = applyProposal([], p, 'new-id');
    expect(m).toMatchObject({ id: 'new-id', localDate: TODAY, slot: 'lunch', servings: 4, status: 'planned' });
    expect(m.items).toEqual([{ kind: 'dish', recipeId: p.recipeId, recipeName: p.recipeName }]);
  });
});

describe('the plan survives a backup round trip', () => {
  it('keeps dishes, cooked links, eating out, leftovers and cancelled meals', () => {
    const r = seed.recipes[0];
    const l: Leftover = {
      id: 'lo1', name: 'Daal', portionsMade: 2, portionsLeft: 2, madeOn: TODAY, location: 'fridge',
      log: [{ at: '2026-10-05T00:00:00Z', localDate: TODAY, kind: 'made', portions: 2 }],
    };
    let m = setCooked(addDish(newMeal('m1', TODAY, 'lunch', 4), r), 0, 'c1');
    m = addLeftover(addDish(m, seed.recipes[1]), l, 1);
    const out = cancelMeal(addEatOut(newMeal('m2', '2026-10-06', 'dinner', 3), 'Kolachi'));
    const parsed = parseBackup(exportBackup({ ...seed, plan: [m, out], leftovers: [l] }));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    if (parsed.ok) expect(parsed.data.plan).toEqual([m, out]);
  });
});
