import { describe, expect, it } from 'vitest';
import { balances, makeEvent } from './ledger';
import { availability } from './suggest';
import type { Ingredient, Recipe } from './types';
import { toBase } from './units';
import {
  buildUsage, displayAmount, exceedsStock, initialUsage, parseExact, quickChoices, stepFor, stepUsed, usageMovements,
} from './usage';

const rice: Ingredient = { id: 'Rice', name: 'Rice', aliases: [], dimension: 'mass', displayUnit: 'kg', aisle: 'Pantry', conversions: { cup: 200 } };
const oil: Ingredient = { id: 'Oil', name: 'Oil', aliases: [], dimension: 'volume', displayUnit: 'L', aisle: 'Pantry' };
const egg: Ingredient = { id: 'Egg', name: 'Egg', aliases: [], dimension: 'count', displayUnit: 'pc', aisle: 'Dairy' };
const salt: Ingredient = { id: 'Salt', name: 'Salt', aliases: [], dimension: 'mass', displayUnit: 'g', aisle: 'Spices' };
const byId = new Map([rice, oil, egg, salt].map(i => [i.id, i]));

const recipe: Recipe = {
  id: 'R1', name: 'Test', serves: 4, time: '', notes: '', version: 1,
  ingredients: [
    { ingredientId: 'Rice', amount: 500, unit: 'g' },
    { ingredientId: 'Oil', amount: 60, unit: 'ml' },
    { ingredientId: 'Egg', amount: 2, unit: 'pc' },
    { ingredientId: 'Salt', amount: 1, unit: 'pao' }, // no rule: cannot convert
  ],
};

const bought = (items: Record<string, number>) =>
  Object.entries(items).map(([id, n]) => makeEvent('purchase', [{ ingredientId: id, delta: n, basis: 'measured' }], new Date('2026-10-01T00:00:00Z')));

function lines(servings = 4, have: Record<string, number> = { Rice: 1000, Oil: 500, Egg: 6, Salt: 100 }) {
  return buildUsage(availability(recipe, servings, balances(bought(have)), byId, toBase), recipe, byId);
}

describe('buildUsage', () => {
  it('starts from the recipe amounts in base and display units', () => {
    expect(lines().map(x => [x.ingredientId, x.recipeBase, x.recipeAmount, x.unit])).toEqual([
      ['Rice', 500, 500, 'g'], ['Oil', 60, 60, 'ml'], ['Egg', 2, 2, 'pc'], ['Salt', null, 1, 'pao'],
    ]);
  });
  it('scales with servings and switches to kg for large amounts', () => {
    const rl = lines(8)[0];
    expect(rl.recipeBase).toBe(1000);
    expect(rl.unit).toBe('kg');
    expect(rl.recipeAmount).toBe(1);
    expect(rl.factor).toBe(1000);
  });
  it('lists an unconvertible ingredient as not deducted, with a reason', () => {
    const l = lines();
    expect(l[3].editable).toBe(false);
    expect(l[3].reason).toMatch(/pao/);
    expect(initialUsage(l)).toEqual({ Rice: 500, Oil: 60, Egg: 2 });
  });
  it('converts household units that have a rule', () => {
    const cups: Recipe = { ...recipe, ingredients: [{ ingredientId: 'Rice', amount: 2, unit: 'cup' }] };
    const l = buildUsage(availability(cups, 4, balances(bought({ Rice: 1000 })), byId, toBase), cups, byId)[0];
    expect(l.editable).toBe(true);
    expect(l.recipeBase).toBe(400);
  });
});

describe('steps and quick choices', () => {
  it('picks a sensible step per unit', () => {
    expect(stepFor('g', 500)).toBe(50);
    expect(stepFor('g', 20)).toBe(10);
    expect(stepFor('kg', 1)).toBe(0.25);
    expect(stepFor('pc', 2)).toBe(1);
    expect(stepFor('tsp', 1)).toBe(1);
    expect(stepFor('cup', 3)).toBe(1);
    expect(stepFor('cup', 0.5)).toBe(0.25);
  });
  it('offers None, Half, Recipe amount and 1.5x', () => {
    expect(quickChoices(lines()[0]).map(c => [c.label, c.base])).toEqual([
      ['None', 0], ['Half', 250], ['Recipe amount', 500], ['1.5x', 750],
    ]);
  });
  it('steps up and down, never below zero, and returns to the exact recipe amount', () => {
    const l = lines()[0];
    expect(stepUsed(l, 500, 1)).toBe(550);
    expect(stepUsed(l, 550, -1)).toBe(500);
    expect(stepUsed(l, 30, -1)).toBe(0);
    expect(stepUsed(l, 0, -1)).toBe(0);
    const kg = lines(8)[0];
    expect(stepUsed(kg, 1000, 1)).toBe(1250);
    expect(displayAmount(kg, 1250)).toBe(1.25);
  });
});

describe('exact entry', () => {
  const l = lines()[0];
  it('converts typed amounts back to base units', () => {
    expect(parseExact(l, '350', rice)).toEqual({ ok: true, base: 350 });
    expect(parseExact(lines(8)[0], '1.5', rice)).toEqual({ ok: true, base: 1500 });
    expect(parseExact(l, '0', rice)).toEqual({ ok: true, base: 0 });
    expect(parseExact(l, '2,5', rice)).toEqual({ ok: true, base: 2.5 });
  });
  it('refuses blanks, negatives and non-numbers', () => {
    expect(parseExact(l, '  ', rice).ok).toBe(false);
    expect(parseExact(l, '-5', rice)).toMatchObject({ ok: false, error: expect.stringMatching(/negative/) });
    expect(parseExact(l, 'abc', rice).ok).toBe(false);
  });
});

describe('usageMovements', () => {
  it('is negative, measured, and omits zeros and unconvertible lines', () => {
    expect(usageMovements(lines(), { Rice: 250, Oil: 0, Egg: 3 })).toEqual([
      { ingredientId: 'Rice', delta: -250, basis: 'measured' },
      { ingredientId: 'Egg', delta: -3, basis: 'measured' },
    ]);
  });
  it('with the initial amounts equals the recipe deduction', () => {
    const l = lines();
    expect(usageMovements(l, initialUsage(l)).map(x => x.delta)).toEqual([-500, -60, -2]);
  });
  it('changes stock by exactly what was used', () => {
    const cook = makeEvent('cook', usageMovements(lines(), { Rice: 750, Oil: 0, Egg: 1 }), new Date('2026-10-02T00:00:00Z'));
    const after = balances([...bought({ Rice: 1000, Oil: 500, Egg: 6 }), cook]);
    expect(after.get('Rice')!.amount).toBe(250);
    expect(after.get('Oil')!.amount).toBe(500);
    expect(after.get('Egg')!.amount).toBe(5);
  });
});

describe('exceedsStock', () => {
  it('flags more than recorded, not equal, and not unknown stock', () => {
    const l = lines(4, { Rice: 400, Oil: 500, Egg: 6, Salt: 100 })[0];
    expect(exceedsStock(l, 400)).toBe(false);
    expect(exceedsStock(l, 450)).toBe(true);
    expect(exceedsStock({ ...l, haveBase: null }, 9999)).toBe(false);
  });
});
