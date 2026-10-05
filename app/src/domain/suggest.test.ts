import { describe, expect, it } from 'vitest';
import { makeEvent } from './ledger';
import { availability, cookableNow, suggestNextMeals, type ToBase } from './suggest';
import { balances } from './ledger';
import type { Ingredient, KitchenEvent, MealRating, Recipe } from './types';

// A minimal converter for these tests; the real one is units.ts.
const toBase: ToBase = (amount, unit) => {
  if (unit === 'kg') return { ok: true, value: amount * 1000 };
  if (unit === 'g' || unit === 'pc') return { ok: true, value: amount };
  return { ok: false, reason: `no rule for ${unit}` };
};

const ing = (id: string, dimension: Ingredient['dimension'] = 'count'): Ingredient =>
  ({ id, name: id, aliases: [], dimension, displayUnit: dimension === 'mass' ? 'g' : 'pc', aisle: 'Test' });
const ingredients = [ing('Chicken', 'mass'), ing('Tomato'), ing('Daal', 'mass'), ing('Egg')];
const byId = new Map(ingredients.map(i => [i.id, i]));

const recipe = (id: string, serves: number, items: [string, number, string][]): Recipe => ({
  id, name: id, serves, time: '30 min', notes: '', version: 1,
  ingredients: items.map(([ingredientId, amount, unit]) => ({ ingredientId, amount, unit })),
});
const karahi = recipe('R004', 5, [['Chicken', 1, 'kg'], ['Tomato', 6, 'pc']]);
const daal = recipe('R006b', 4, [['Daal', 250, 'g']]);
const omelette = recipe('X1', 2, [['Egg', 4, 'pc']]);

const stockEvent = (id: string, deltas: Record<string, number>, iso = '2026-10-01T09:00:00+05:00') =>
  makeEvent('purchase', Object.entries(deltas).map(([ingredientId, delta]) => ({ ingredientId, delta, basis: 'measured' as const })), new Date(iso), { id });

const cooked = (id: string, recipeId: string, iso: string, rating?: MealRating): KitchenEvent =>
  makeEvent('cook', [], new Date(iso), { id, meal: { recipeId, recipeVersion: 1, slot: 'lunch', servings: 4, rating } });

describe('availability', () => {
  it('scales the recipe to the servings and finds what is short', () => {
    const stock = balances([stockEvent('s', { Chicken: 1500, Tomato: 6 })]);
    expect(availability(karahi, 5, stock, byId, toBase).status).toBe('ready');
    const forTen = availability(karahi, 10, stock, byId, toBase);
    expect(forTen.status).toBe('missing');
    expect(forTen.missing.map(m => [m.ingredientId, m.short])).toEqual([['Chicken', 500], ['Tomato', 6]]);
  });

  it('never calls a dish ready when an amount cannot be converted', () => {
    const chai = recipe('C1', 2, [['Daal', 1, 'cup']]);
    const stock = balances([stockEvent('s', { Daal: 1000 })]);
    const a = availability(chai, 2, stock, byId, toBase);
    expect(a.status).toBe('maybe');
    expect(a.needs[0].status).toBe('unconvertible');
  });

  it('lists ready dishes first, then the closest ones (F5)', () => {
    const events = [stockEvent('s', { Chicken: 1000, Tomato: 3, Daal: 500 })];
    const ranked = cookableNow([karahi, daal, omelette], 4, events, ingredients, toBase);
    expect(ranked.map(a => [a.recipeId, a.status])).toEqual([
      ['R006b', 'ready'], ['R004', 'missing'], ['X1', 'missing'],
    ]);
  });
});

describe('suggested next meal (F81)', () => {
  const pantry = stockEvent('s', { Chicken: 2000, Tomato: 12, Daal: 1000, Egg: 12 });

  it('prefers a dish that is in stock, not made recently, and loved, with reasons', () => {
    const events = [
      pantry,
      cooked('a', 'R004', '2026-09-22T13:00:00+05:00', 'loved'),
      cooked('b', 'R006b', '2026-10-03T13:00:00+05:00'),
    ];
    const [top] = suggestNextMeals([karahi, daal], 4, events, ingredients, toBase, '2026-10-04');
    expect(top.recipe.id).toBe('R004');
    expect(top.reasons).toEqual(['You have everything', 'Last made 12 days ago', 'Everyone loved it']);
  });

  it('leaves out dishes the family said "Not again" to', () => {
    const events = [pantry, cooked('a', 'X1', '2026-09-01T09:00:00+05:00', 'not-again')];
    const ids = suggestNextMeals([karahi, daal, omelette], 4, events, ingredients, toBase, '2026-10-04').map(s => s.recipe.id);
    expect(ids).not.toContain('X1');
  });

  it('pushes yesterday\'s dish down the list', () => {
    const events = [pantry, cooked('a', 'R006b', '2026-10-03T20:00:00+05:00', 'loved')];
    const ids = suggestNextMeals([karahi, daal], 4, events, ingredients, toBase, '2026-10-04').map(s => s.recipe.id);
    expect(ids).toEqual(['R004', 'R006b']);
  });
});

describe('suggestions suit the meal (no biryani for breakfast)', () => {
  it('only suggests dishes that suit the slot', () => {
    const pantry = stockEvent('s', { Chicken: 2000, Tomato: 12, Daal: 1000, Egg: 12 });
    const breakfastEggs: Recipe = { ...omelette, meals: ['breakfast'] };
    const lunchKarahi: Recipe = { ...karahi, meals: ['lunch', 'dinner'] };
    const ids = (slot: 'breakfast' | 'lunch') =>
      suggestNextMeals([lunchKarahi, breakfastEggs], 4, [pantry], ingredients, toBase, '2026-10-04', new Set(), slot).map(s => s.recipe.id);
    expect(ids('breakfast')).toEqual(['X1']);
    expect(ids('lunch')).toEqual(['R004']);
  });
});
