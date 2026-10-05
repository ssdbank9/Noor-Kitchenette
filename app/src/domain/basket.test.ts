import { describe, expect, it } from 'vitest';
import { basketAmountText, basketFromPlan, basketShareText, basketWhy, groupBasketByAisle } from './basket';
import { effectiveIds, makeEvent, reverse } from './ledger';
import { addEatOut, addLeftover, cancelMeal, setCooked } from './plan';
import { baseEvents, ingredients, meal, recipes, stockEvent, stockFor } from './planTestKit';
import { fromBase, toBase } from './units';
import type { Ingredient, KitchenEvent, PlannedMeal } from './types';

const TODAY = '2026-10-05';
const fmt = (b: number, i: Ingredient) => { const { amount, unit } = fromBase(b, i); return `${amount} ${unit}`; };
const basket = (plan: PlannedMeal[], events: KitchenEvent[] = baseEvents(), topUps = false) =>
  basketFromPlan(plan, recipes, stockFor(events), ingredients, toBase, TODAY, events, { topUps });
const line = (lines: ReturnType<typeof basket>, id: string) => lines.find(l => l.ingredientId === id);

describe('basketFromPlan', () => {
  it('is empty with an empty plan', () => {
    expect(basket([])).toEqual([]);
  });
  it('aggregates one meal: scaled to servings, minus stock', () => {
    // Karahi for 4 needs 1 kg chicken, 2 onions; stock is 1.5 kg and 6 onions: nothing to buy.
    expect(basket([meal('a', TODAY, 'lunch', ['K'])])).toEqual([]);
    // For 8 it needs 2 kg chicken: short 500 g.
    const l = basket([{ ...meal('a', TODAY, 'lunch', ['K']), servings: 8 }]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ ingredientId: 'Chicken', amountBase: 500, reasons: ['planned'], plannedNeed: 2000, stock: 1500 });
  });
  it('combines identical ingredients across meals and lists each meal', () => {
    const l = basket([meal('a', TODAY, 'lunch', ['K']), meal('b', '2026-10-06', 'dinner', ['P'])]);
    const chicken = line(l, 'Chicken')!;
    expect(chicken.amountBase).toBe(500); // 2000 needed - 1500 once
    expect(chicken.meals.map(m => m.recipeName)).toEqual(['Karahi', 'Pulao']);
    expect(l).toHaveLength(1);
  });
  it('subtracts stock exactly once however many meals use the ingredient', () => {
    const l = basket([meal('a', TODAY, 'lunch', ['K']), meal('b', '2026-10-06', 'lunch', ['K']), meal('c', '2026-10-07', 'lunch', ['K'])]);
    expect(line(l, 'Chicken')!.amountBase).toBe(3000 - 1500);
  });
  it('turns not-sure stock, flagged stock and unconvertible units into Check lines with no quantity', () => {
    const unsure = [...baseEvents(), stockEvent('s9', 'Chicken', null)];
    const l = basket([meal('a', TODAY, 'lunch', ['K'])], unsure);
    expect(line(l, 'Chicken')).toMatchObject({ amountBase: null, checkWhy: 'stock-unknown' });
    expect(line(l, 'Onion')).toBeUndefined();

    // Using more than recorded flags the stock for checking.
    const flagged = [...baseEvents(), makeEvent('use', [{ ingredientId: 'Chicken', delta: -9000, basis: 'measured' }], new Date('2026-10-05T01:00:00Z'))];
    expect(line(basket([meal('a', TODAY, 'lunch', ['K'])], flagged), 'Chicken')).toMatchObject({ amountBase: null, checkWhy: 'stock-check' });

    expect(line(basket([meal('a', TODAY, 'lunch', ['O'])]), 'Salt')).toMatchObject({ amountBase: null });
    expect(line(basket([meal('a', TODAY, 'lunch', ['O'])], [...baseEvents(), stockEvent('s9', 'Salt', 500)]), 'Salt')).toMatchObject({ amountBase: null, checkWhy: 'unit' });
  });
  it('treats an ingredient with no stock record as zero', () => {
    const l = basket([meal('a', TODAY, 'lunch', ['K'])], []);
    expect(line(l, 'Chicken')).toMatchObject({ amountBase: 1000, stock: 0 });
    expect(line(l, 'Onion')!.amountBase).toBe(2);
  });
  it('a cancelled meal removes its needs', () => {
    const plan = [{ ...meal('a', TODAY, 'lunch', ['K']), servings: 8 }];
    expect(basket(plan)).toHaveLength(1);
    expect(basket([cancelMeal(plan[0])])).toEqual([]);
  });
  it('a cooked dish drops out, and undoing the cook brings it back', () => {
    const cook = makeEvent('cook', [], new Date('2026-10-05T08:00:00Z'), { id: 'c1' });
    const plan = [setCooked({ ...meal('a', TODAY, 'lunch', ['K']), servings: 8 }, 0, 'c1')];
    expect(basket(plan, [...baseEvents(), cook])).toEqual([]);
    const undo = reverse(cook, [...baseEvents(), cook], new Date('2026-10-05T09:00:00Z'));
    expect(basket(plan, [...baseEvents(), cook, undo])).toHaveLength(1);
  });
  it('ignores meals before today', () => {
    expect(basket([{ ...meal('a', '2026-10-04', 'lunch', ['K']), servings: 8 }])).toEqual([]);
  });
  it('eating-out and leftover items add nothing', () => {
    const m = addLeftover(addEatOut(meal('a', TODAY, 'lunch', []), 'Cafe'), { id: 'l1', name: 'Karahi', portionsLeft: 4 }, 2);
    expect(basket([m], baseEvents(), true).filter(l => l.meals.length > 0)).toEqual([]);
    expect(basket([m])).toEqual([]);
    // Eating out at a meal that also had a dish: the dish is not bought for.
    const both = addEatOut({ ...meal('b', TODAY, 'dinner', ['K']), servings: 8 }, 'Cafe');
    expect(basket([both])).toEqual([]);
    // A leftover item on its own, with a dish elsewhere unaffected.
    const lo = addLeftover(meal('c', TODAY, 'dinner', []), { id: 'l1', name: 'Karahi', portionsLeft: 4 }, 2);
    expect(basket([lo])).toEqual([]);
  });
  it('a partial purchase raises stock so only the remainder is needed', () => {
    const plan = [{ ...meal('a', TODAY, 'lunch', ['K']), servings: 8 }]; // need 2 kg, have 1.5 kg
    expect(line(basket(plan), 'Chicken')!.amountBase).toBe(500);
    const bought = makeEvent('purchase', [{ ingredientId: 'Chicken', delta: 200, basis: 'measured' }], new Date('2026-10-05T07:00:00Z'));
    const after = basket(plan, [...baseEvents(), bought]);
    expect(line(after, 'Chicken')).toMatchObject({ amountBase: 300, stock: 1700 });
    expect(basketAmountText(line(after, 'Chicken')!, ingredients[0], fmt)).toBe('Still need 300 g');
    const full = makeEvent('purchase', [{ ingredientId: 'Chicken', delta: 300, basis: 'measured' }], new Date('2026-10-05T08:00:00Z'));
    expect(basket(plan, [...baseEvents(), bought, full])).toEqual([]);
    // Undoing the purchase brings the need back.
    const undo = reverse(bought, [...baseEvents(), bought], new Date('2026-10-05T09:00:00Z'));
    expect(effectiveIds([...baseEvents(), bought, undo]).has(bought.id)).toBe(false);
    expect(line(basket(plan, [...baseEvents(), bought, undo]), 'Chicken')!.amountBase).toBe(500);
  });
  it('does not change when the same plan is read twice (derived, no hidden state)', () => {
    const plan = [meal('a', TODAY, 'lunch', ['K']), meal('b', '2026-10-06', 'dinner', ['P'])];
    expect(basket(plan)).toEqual(basket(plan));
  });
});

describe('staple top-ups', () => {
  it('targets the minimum after the planned cooking', () => {
    // Karahi + Pulao use 2 kg chicken of 1.5 kg: planned short 500 g, plus minimum 500 g.
    expect(basket([meal('a', TODAY, 'lunch', ['K', 'P'])], baseEvents(), true).map(l => l.ingredientId)).toEqual(['Chicken']);
  });
  it('one line with both reasons, never summed twice', () => {
    // Chicken 1.5 kg, min 500 g. Karahi for 4 needs 1 kg: after cooking 500 g is left = the minimum.
    expect(basket([meal('a', TODAY, 'lunch', ['K'])], baseEvents(), true)).toEqual([]);
    // Two chicken meals need 2 kg: planned short 500 g, plus the 500 g minimum = 1000 g, in ONE line.
    const l = basket([meal('a', TODAY, 'lunch', ['K']), meal('b', '2026-10-06', 'dinner', ['P'])], baseEvents(), true);
    const chicken = l.filter(x => x.ingredientId === 'Chicken');
    expect(chicken).toHaveLength(1);
    expect(chicken[0]).toMatchObject({ amountBase: 1000, reasons: ['planned', 'top-up'], plannedNeed: 2000, stock: 1500 });
    expect(basketWhy(chicken[0], ingredients[0], fmt)).toContain('so you are not below your minimum after cooking');
  });
  it('a top-up alone has only the top-up reason and no meals', () => {
    const low = [...baseEvents(), stockEvent('s9', 'Rice', 300)];
    expect(basket([], low, true)).toEqual([{ ingredientId: 'Rice', amountBase: 700, reasons: ['top-up'], meals: [], plannedNeed: 0, stock: 300 }]);
  });
  it('is off by default and unknown stock for a staple becomes Check', () => {
    const low = [...baseEvents(), stockEvent('s9', 'Rice', 300)];
    expect(basket([], low)).toEqual([]);
    const unsure = [...baseEvents(), stockEvent('s9', 'Rice', null)];
    expect(line(basket([], unsure, true), 'Rice')).toMatchObject({ amountBase: null, reasons: ['top-up'] });
  });
  it('a planned need with plenty over the minimum adds nothing', () => {
    const plenty = [...baseEvents(), stockEvent('s9', 'Rice', 5000)];
    expect(basket([meal('a', TODAY, 'lunch', ['P'])], plenty, true).filter(l => l.ingredientId === 'Rice')).toEqual([]);
  });
});

describe('grouping and sharing', () => {
  it('groups by aisle and writes plain text', () => {
    const l = basket([{ ...meal('a', TODAY, 'lunch', ['K']), servings: 8 }, meal('b', TODAY, 'dinner', ['O'])]);
    expect(groupBasketByAisle(l, ingredients).map(g => g.aisle)).toEqual(['Meat', 'Pantry']);
    expect(basketShareText(l, ingredients, fmt)).toBe("This week's basket\n\nMeat\n- Chicken 500 g\n\nPantry\n- Salt (check)");
    expect(basketShareText([], ingredients, fmt)).toBe('');
  });
});
