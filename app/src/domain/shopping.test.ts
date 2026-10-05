import { describe, expect, it } from 'vitest';
import type { Balance } from './ledger';
import { addDishShortfall, addLowStock, groupByAisle, lowStockTopUps, removeItem, shareText } from './shopping';
import type { Availability, Need } from './suggest';
import type { Ingredient } from './types';

const ing = (id: string, aisle: string, minStock?: number): Ingredient => ({
  id, name: id, aliases: [], dimension: 'mass', displayUnit: 'g', aisle, ...(minStock !== undefined ? { minStock } : {}),
});
const ingredients = [ing('Onion', 'Produce', 1000), ing('Chicken', 'Meat', 500), ing('Salt', 'Spices', 200), ing('Rice', 'Pantry', 1000)];
const need = (id: string, short: number | null, status: Need['status'] = 'short'): Need => ({
  ingredientId: id, need: 500, have: 0, short, status, optional: false,
});
const avail = (recipeId: string, needs: Need[]): Availability => ({
  recipeId, servings: 4, status: 'missing', needs, coverage: 0, missing: needs.filter(n => n.status === 'short'),
});
const bal = (amount: number | null): Balance => ({ amount, basis: 'measured', lastChanged: '2026-10-01' });

describe('addDishShortfall', () => {
  it('adds the shortfall of each missing ingredient', () => {
    const list = addDishShortfall([], avail('R1', [need('Onion', 300), need('Salt', 0, 'enough')]));
    expect(list).toEqual([{ ingredientId: 'Onion', amountBase: 300, reason: 'dish', recipeIds: ['R1'] }]);
  });
  it('combines the same ingredient across dishes into one summed line', () => {
    let list = addDishShortfall([], avail('R1', [need('Onion', 300)]));
    list = addDishShortfall(list, avail('R2', [need('Onion', 200), need('Chicken', 400)]));
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ ingredientId: 'Onion', amountBase: 500, reason: 'dish', recipeIds: ['R1', 'R2'] });
  });
  it('does not add the same dish twice', () => {
    const a = avail('R1', [need('Onion', 300)]);
    expect(addDishShortfall(addDishShortfall([], a), a)[0].amountBase).toBe(300);
  });
  it('lists not-sure stock as a check, with no quantity', () => {
    const list = addDishShortfall([], avail('R1', [need('Onion', null, 'maybe')]));
    expect(list[0].amountBase).toBeNull();
  });
  it('skips optional ingredients', () => {
    expect(addDishShortfall([], avail('R1', [{ ...need('Onion', 300), optional: true }]))).toEqual([]);
  });
});

describe('low-stock top-ups', () => {
  it('tops up to the minimum and ignores stocked or unset items', () => {
    const stock = new Map([['Onion', bal(400)], ['Chicken', bal(500)], ['Rice', bal(1500)]]);
    expect(lowStockTopUps(ingredients, stock)).toEqual([
      { ingredientId: 'Onion', amountBase: 600, reason: 'low-stock', recipeIds: [] },
      { ingredientId: 'Salt', amountBase: 200, reason: 'low-stock', recipeIds: [] },
    ]);
  });
  it('lists not-sure stock as check, not a quantity', () => {
    const items = lowStockTopUps(ingredients, new Map([['Onion', bal(null)]]));
    expect(items.find(i => i.ingredientId === 'Onion')?.amountBase).toBeNull();
  });
  it('never counts an ingredient twice: takes the larger need and keeps the dish reason', () => {
    const stock = new Map([['Onion', bal(400)]]); // top-up 600
    const small = addLowStock(addDishShortfall([], avail('R1', [need('Onion', 300)])), ingredients, stock);
    expect(small.find(i => i.ingredientId === 'Onion')).toEqual({ ingredientId: 'Onion', amountBase: 600, reason: 'dish', recipeIds: ['R1'] });
    const big = addLowStock(addDishShortfall([], avail('R1', [need('Onion', 900)])), ingredients, stock);
    expect(big.find(i => i.ingredientId === 'Onion')?.amountBase).toBe(900);
  });
  it('a dish added after a top-up also takes the larger need', () => {
    const list = addDishShortfall(addLowStock([], ingredients, new Map([['Onion', bal(400)]])), avail('R1', [need('Onion', 300)]));
    const onion = list.find(i => i.ingredientId === 'Onion')!;
    expect(onion).toMatchObject({ amountBase: 600, reason: 'dish', recipeIds: ['R1'] });
  });
});

describe('groupByAisle and sharing', () => {
  const list = addLowStock([], ingredients, new Map());
  it('groups in the order aisles appear on the ingredients', () => {
    expect(groupByAisle(list, ingredients).map(g => g.aisle)).toEqual(['Produce', 'Meat', 'Spices', 'Pantry']);
    expect(groupByAisle(removeItem(list, 'Onion'), ingredients).map(g => g.aisle)).toEqual(['Meat', 'Spices', 'Pantry']);
  });
  it('writes plain text by aisle, with check for unknown amounts', () => {
    const l = addDishShortfall([], avail('R1', [need('Onion', 300), need('Chicken', null, 'maybe')]));
    const text = shareText(l, ingredients, (b, i) => `${b} g ${i.id}`);
    expect(text).toBe('Shopping list\n\nProduce\n- Onion 300 g Onion\n\nMeat\n- Chicken (check)');
  });
});
