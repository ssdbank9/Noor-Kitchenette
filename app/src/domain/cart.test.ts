import { describe, expect, it } from 'vitest';
import type { BasketLine } from './basket';
import { addManualItem, cartLines, cartShareText, clearDismissals, groupCart, lowIsHidden, removed, snoozed, type CartInput } from './cart';
import type { Balance } from './ledger';
import { defaultShopPrefs } from './shopPrefs';
import type { Ingredient, ShopPrefs } from './types';
import { fromBase } from './units';

const ing = (id: string, name: string, aisle: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  id, name, aliases: [], dimension: 'mass', displayUnit: 'kg', aisle, ...extra,
});
const INGS: Ingredient[] = [
  ing('Chicken', 'Chicken', 'Meat', { minStock: 1000 }),
  ing('Onion', 'Onion', 'Produce', { minStock: 2, dimension: 'count', displayUnit: 'pc' }),
  ing('Apple', 'Apple', 'Produce', { dimension: 'count', displayUnit: 'pc' }),
  ing('Buldak', 'Buldak noodles', 'Snacks & noodles', { dimension: 'count', displayUnit: 'pack', minStock: 5, buyAmount: 5, conversions: { pack: 1 } }),
  ing('Rice', 'Rice', 'Pantry/Dry Goods', { minStock: 1000 }),
];
const bal = (amount: number | null, extra: Partial<Balance> = {}): Balance => ({ amount, basis: amount === null ? 'unknown' : 'measured', lastChanged: '2026-10-01', ...extra });
const TODAY = '2026-10-05';
// Everything is comfortably stocked unless a test says otherwise.
const full = (): Map<string, Balance> => new Map([
  ['Chicken', bal(2000)], ['Onion', bal(6)], ['Apple', bal(3)], ['Buldak', bal(5)], ['Rice', bal(5000)],
]);
const cart = (over: Partial<CartInput> = {}) => cartLines({
  manual: [], basket: [], ingredients: INGS, stock: full(), today: TODAY, prefs: defaultShopPrefs(), ...over,
});
const find = (lines: ReturnType<typeof cart>, id: string) => lines.find(l => l.ingredientId === id);
const planLine = (id: string, amount: number | null, names: string[], extra: Partial<BasketLine> = {}): BasketLine => ({
  ingredientId: id, amountBase: amount, reasons: ['planned'], plannedNeed: amount ?? 0, stock: 0,
  meals: names.map((n, i) => ({ mealId: `m${i}`, localDate: '2026-10-06', slot: 'dinner' as const, recipeName: n, need: 0 })), ...extra,
});
const withPrefs = (p: Partial<ShopPrefs>): ShopPrefs => ({ ...defaultShopPrefs(), ...p });

describe('cartLines: sources', () => {
  it('is empty when everything is stocked and nothing is planned or listed', () => {
    expect(cart()).toEqual([]);
  });
  it('adds an item below its minimum, topped up to the minimum', () => {
    const stock = full(); stock.set('Chicken', bal(400));
    const l = find(cart({ stock }), 'Chicken')!;
    expect(l.amountBase).toBe(600);
    expect(l.reasons).toEqual({ low: true });
  });
  it('an ingredient she never recorded is NOT low (the starter minimums must not flood the list)', () => {
    const stock = full(); stock.delete('Chicken');
    expect(find(cart({ stock }), 'Chicken')).toBeUndefined();
  });
  it('one she has recorded as finished (zero) IS low', () => {
    const stock = full(); stock.set('Chicken', bal(0));
    expect(find(cart({ stock }), 'Chicken')!.amountBase).toBe(1000);
  });
  it('with nothing recorded at all only the always-keep staples appear; manual items still show', () => {
    expect(cart({ stock: new Map() }).map(l => l.ingredientId)).toEqual(['Buldak']);
    expect(find(cart({ stock: new Map(), manual: [{ ingredientId: 'Apple', amountBase: 2, reason: 'dish', recipeIds: [] }] }), 'Apple')).toBeDefined();
  });
  it('does not add an item at or above its minimum, or one with no minimum', () => {
    const stock = full(); stock.set('Chicken', bal(1000)); stock.set('Apple', bal(0));
    const lines = cart({ stock });
    expect(find(lines, 'Chicken')).toBeUndefined();
    expect(find(lines, 'Apple')).toBeUndefined();
  });
  it('takes the plan line from the basket with the dish names', () => {
    const l = find(cart({ basket: [planLine('Apple', 4, ['Karahi', 'Pulao'])] }), 'Apple')!;
    expect(l.amountBase).toBe(4);
    expect(l.reasons).toEqual({ plan: ['Karahi', 'Pulao'] });
    expect(l.meals).toHaveLength(2);
  });
  it("ignores basket lines that are only top-ups (low stock is the cart's own job)", () => {
    expect(cart({ basket: [{ ...planLine('Apple', 4, []), reasons: ['top-up'] }] })).toEqual([]);
  });
  it('takes the manual list, with the dishes it was added for', () => {
    const l = find(cart({ manual: [{ ingredientId: 'Apple', amountBase: 3, reason: 'dish', recipeIds: ['R1'] }] }), 'Apple')!;
    expect(l.amountBase).toBe(3);
    expect(l.reasons).toEqual({ manual: true });
    expect(l.manualRecipeIds).toEqual(['R1']);
  });
  it('skips ingredients that no longer exist', () => {
    expect(cart({ manual: [{ ingredientId: 'Ghost', amountBase: 1, reason: 'dish', recipeIds: [] }] })).toEqual([]);
  });
});

describe('cartLines: one line per ingredient, the larger need, all reasons', () => {
  it('plan + low is ONE line with the larger amount, not the sum', () => {
    const stock = full(); stock.set('Chicken', bal(400)); // low: needs 600
    const lines = cart({ stock, basket: [planLine('Chicken', 900, ['Karahi'])] });
    expect(lines.filter(l => l.ingredientId === 'Chicken')).toHaveLength(1);
    const l = find(lines, 'Chicken')!;
    expect(l.amountBase).toBe(900);
    expect(l.reasons).toEqual({ low: true, plan: ['Karahi'] });
  });
  it('takes the low amount when it is larger than the plan', () => {
    const stock = full(); stock.set('Chicken', bal(0));
    expect(find(cart({ stock, basket: [planLine('Chicken', 300, ['Karahi'])] }), 'Chicken')!.amountBase).toBe(1000);
  });
  it('manual + low takes the larger and keeps both reasons', () => {
    const stock = full(); stock.set('Chicken', bal(400));
    const l = find(cart({ stock, manual: [{ ingredientId: 'Chicken', amountBase: 2500, reason: 'dish', recipeIds: [] }] }), 'Chicken')!;
    expect(l.amountBase).toBe(2500);
    expect(l.reasons).toEqual({ low: true, manual: true });
  });
  it('manual + plan + low is still one line with the largest of the three', () => {
    const stock = full(); stock.set('Chicken', bal(400));
    const l = find(cart({
      stock, basket: [planLine('Chicken', 700, ['Karahi'])],
      manual: [{ ingredientId: 'Chicken', amountBase: 800, reason: 'dish', recipeIds: [] }],
    }), 'Chicken')!;
    expect(l.amountBase).toBe(800);
    expect(l.reasons).toEqual({ low: true, plan: ['Karahi'], manual: true });
  });
  it('two manual entries for one ingredient make one line (largest)', () => {
    const l = cart({ manual: [
      { ingredientId: 'Apple', amountBase: 2, reason: 'dish', recipeIds: ['R1'] },
      { ingredientId: 'Apple', amountBase: 5, reason: 'low-stock', recipeIds: [] },
    ] });
    expect(l).toHaveLength(1);
    expect(l[0].amountBase).toBe(5);
  });
});

describe('cartLines: Check lines', () => {
  it('"not sure" stock is a Check line with no quantity', () => {
    const stock = full(); stock.set('Chicken', bal(null));
    const l = find(cart({ stock }), 'Chicken')!;
    expect(l.amountBase).toBeNull();
    expect(l.reasons.low).toBe(true);
  });
  it('stock flagged for a check is a Check line', () => {
    const stock = full(); stock.set('Chicken', bal(0, { needsCheck: true }));
    expect(find(cart({ stock }), 'Chicken')!.amountBase).toBeNull();
  });
  it('an unconvertible plan line stays a Check line', () => {
    expect(find(cart({ basket: [planLine('Apple', null, ['Karahi'])] }), 'Apple')!.amountBase).toBeNull();
  });
  it('a known amount from another source beats Check, and Check never becomes a guess', () => {
    const stock = full(); stock.set('Chicken', bal(null));
    const l = find(cart({ stock, manual: [{ ingredientId: 'Chicken', amountBase: 1500, reason: 'dish', recipeIds: [] }] }), 'Chicken')!;
    expect(l.amountBase).toBe(1500);
    expect(find(cart({ stock }), 'Chicken')!.amountBase).toBeNull();
  });
});

describe('cartLines: dismissals only hide the automatic low-stock reason', () => {
  const lowChicken = () => { const s = full(); s.set('Chicken', bal(400)); return s; };
  it('a snooze hides the low item until the day it ends, and it comes back that day', () => {
    const prefs = snoozed(defaultShopPrefs(), 'Chicken', TODAY);
    expect(prefs.dismissed[0]).toEqual({ ingredientId: 'Chicken', kind: 'snooze', until: '2026-10-12' });
    expect(find(cart({ stock: lowChicken(), prefs }), 'Chicken')).toBeUndefined();
    expect(find(cart({ stock: lowChicken(), prefs, today: '2026-10-11' }), 'Chicken')).toBeUndefined();
    expect(find(cart({ stock: lowChicken(), prefs, today: '2026-10-12' }), 'Chicken')).toBeDefined();
  });
  it('a snooze across a month end counts days, not digits', () => {
    expect(snoozed(defaultShopPrefs(), 'Chicken', '2026-10-28').dismissed[0].until).toBe('2026-11-04');
  });
  it('"removed" hides it while stock is the same or higher, and returns when stock is lower', () => {
    const prefs = removed(defaultShopPrefs(), 'Chicken', 400);
    expect(find(cart({ stock: lowChicken(), prefs }), 'Chicken')).toBeUndefined();
    const s = full(); s.set('Chicken', bal(450));
    expect(find(cart({ stock: s, prefs }), 'Chicken')).toBeUndefined();
    s.set('Chicken', bal(399));
    expect(find(cart({ stock: s, prefs }), 'Chicken')!.amountBase).toBe(601);
  });
  it('a manual line shows even when the item was removed or snoozed', () => {
    const manual = [{ ingredientId: 'Chicken', amountBase: 1500, reason: 'dish' as const, recipeIds: [] }];
    for (const prefs of [removed(defaultShopPrefs(), 'Chicken', 400), snoozed(defaultShopPrefs(), 'Chicken', TODAY)]) {
      const l = find(cart({ stock: lowChicken(), prefs, manual }), 'Chicken')!;
      expect(l.amountBase).toBe(1500);
      expect(l.reasons).toEqual({ manual: true }); // the low reason stays hidden
    }
  });
  it('a plan line shows even when the item was dismissed, with only the plan reason', () => {
    const prefs = removed(defaultShopPrefs(), 'Chicken', 400);
    const l = find(cart({ stock: lowChicken(), prefs, basket: [planLine('Chicken', 900, ['Karahi'])] }), 'Chicken')!;
    expect(l.amountBase).toBe(900);
    expect(l.reasons).toEqual({ plan: ['Karahi'] });
  });
  it('removed while stock was not sure stays hidden until the stock is known and low', () => {
    expect(lowIsHidden({ ingredientId: 'x', kind: 'removed', atAmount: null }, TODAY, null)).toBe(true);
    expect(lowIsHidden({ ingredientId: 'x', kind: 'removed', atAmount: null }, TODAY, 100)).toBe(false);
  });
  it('removed hides a later "not sure" too (she already said no)', () => {
    const s = full(); s.set('Chicken', bal(null));
    expect(find(cart({ stock: s, prefs: removed(defaultShopPrefs(), 'Chicken', 400) }), 'Chicken')).toBeUndefined();
  });
  it('a purchase clears the dismissal so the item can return next time it is low', () => {
    const prefs = removed(snoozed(defaultShopPrefs(), 'Onion', TODAY), 'Chicken', 400);
    const cleared = clearDismissals(prefs, ['Chicken']);
    expect(cleared.dismissed.map(d => d.ingredientId)).toEqual(['Onion']);
    expect(clearDismissals(cleared, ['Nothing'])).toBe(cleared);
  });
});

describe('cartLines: staples (Buldak noodles)', () => {
  it('at 3 of 5 packs shows 5 packs, marked as an always-keep item', () => {
    const stock = full(); stock.set('Buldak', bal(3));
    const l = find(cart({ stock }), 'Buldak')!;
    expect(l.amountBase).toBe(5); // max(buyAmount 5, 5 - 3)
    expect(l.reasons).toEqual({ low: true, staple: true });
    expect(fromBase(l.amountBase!, INGS.find(i => i.id === 'Buldak')!)).toEqual({ amount: 5, unit: 'pack' });
  });
  it('at 5 or more it is not in the cart; at 4 it is', () => {
    const stock = full();
    stock.set('Buldak', bal(5)); expect(find(cart({ stock }), 'Buldak')).toBeUndefined();
    stock.set('Buldak', bal(9)); expect(find(cart({ stock }), 'Buldak')).toBeUndefined();
    stock.set('Buldak', bal(4)); expect(find(cart({ stock }), 'Buldak')!.amountBase).toBe(5);
  });
  it('with a minimum far above the usual buy it asks for the shortfall', () => {
    const rich = [...INGS.filter(i => i.id !== 'Buldak'), { ...INGS.find(i => i.id === 'Buldak')!, minStock: 12, buyAmount: 5 }];
    const stock = full(); stock.set('Buldak', bal(1));
    expect(find(cartLines({ manual: [], basket: [], ingredients: rich, stock, today: TODAY, prefs: defaultShopPrefs() }), 'Buldak')!.amountBase).toBe(11);
  });
});

describe('cartLines: order', () => {
  it('sorts by aisle, then name', () => {
    const stock = new Map<string, Balance>([['Chicken', bal(0)], ['Onion', bal(0)], ['Buldak', bal(0)], ['Rice', bal(0)]]);
    const lines = cart({ stock, manual: [{ ingredientId: 'Apple', amountBase: 2, reason: 'dish', recipeIds: [] }] });
    // Meat, Pantry/Dry Goods, Produce (Apple before Onion), Snacks & noodles
    expect(lines.map(l => l.ingredientId)).toEqual(['Chicken', 'Rice', 'Apple', 'Onion', 'Buldak']);
  });
});

describe('grouping and sharing', () => {
  const stock = new Map<string, Balance>([['Chicken', bal(0)], ['Onion', bal(0)], ['Rice', bal(0)], ['Buldak', bal(5)], ['Apple', bal(1)]]);
  const lines = () => cart({ stock });
  it('groups by aisle in cart order', () => {
    expect(groupCart(lines(), INGS, 'aisle', defaultShopPrefs()).map(g => [g.label, g.lines.length])).toEqual([['Meat', 1], ['Pantry/Dry Goods', 1], ['Produce', 1]]);
  });
  it('groups by preferred store, stores in list order, "Any store" last', () => {
    const prefs = withPrefs({ preferred: { Rice: 'alfatah', Onion: 'local' } });
    const g = groupCart(lines(), INGS, 'store', prefs);
    expect(g.map(x => x.label)).toEqual(['Al-Fatah', 'Local shops (I-8 Markaz)', 'Any store']);
    expect(g[2].lines.map(l => l.ingredientId)).toEqual(['Chicken']);
  });
  it('ignores a preferred store that no longer exists', () => {
    const g = groupCart(lines(), INGS, 'store', withPrefs({ preferred: { Rice: 'gone' } }));
    expect(g.map(x => x.label)).toEqual(['Any store']);
  });
  it('shares the whole cart as plain text, Check lines without a quantity', () => {
    const s = new Map(stock); s.set('Onion', bal(null));
    const text = cartShareText(cart({ stock: s }), INGS, 'aisle', defaultShopPrefs(), (b, i) => { const f = fromBase(b, i); return `${f.amount} ${f.unit}`; });
    expect(text).toBe(['Shopping list', '', 'Meat', '- Chicken 1 kg', '', 'Pantry/Dry Goods', '- Rice 1 kg', '', 'Produce', '- Onion (check)'].join('\n'));
    expect(cartShareText([], INGS, 'aisle', defaultShopPrefs(), () => '')).toBe('');
  });
});

describe('addManualItem', () => {
  it('adds a line, and adding the same item again keeps one line with the larger amount', () => {
    const one = addManualItem([], 'Apple', 2);
    expect(one).toEqual([{ ingredientId: 'Apple', amountBase: 2, reason: 'dish', recipeIds: [] }]);
    expect(addManualItem(one, 'Apple', 6)).toHaveLength(1);
    expect(addManualItem(one, 'Apple', 6)[0].amountBase).toBe(6);
    expect(addManualItem(addManualItem(one, 'Apple', 6), 'Apple', 1)[0].amountBase).toBe(6);
  });
  it('a hand-added item shows in the cart as Added', () => {
    const l = cart({ manual: addManualItem([], 'Apple', 4) });
    expect(l[0]).toMatchObject({ ingredientId: 'Apple', amountBase: 4, reasons: { manual: true } });
  });
});
