// Small shared fixtures for the plan and basket tests (not part of the app bundle).
import { balances, makeEvent } from './ledger';
import type { Ingredient, KitchenEvent, PlannedMeal, Recipe } from './types';

export const ing = (id: string, over: Partial<Ingredient> = {}): Ingredient => ({
  id, name: id, aliases: [], dimension: 'mass', displayUnit: 'g', aisle: 'Pantry', ...over,
});

export const ingredients: Ingredient[] = [
  ing('Chicken', { aisle: 'Meat', displayUnit: 'kg', minStock: 500 }),
  ing('Onion', { aisle: 'Produce', dimension: 'count', displayUnit: 'unit', conversions: { unit: 1 }, minStock: 2 }),
  ing('Rice', { minStock: 1000 }),
  ing('Daal'),
  ing('Salt'),
];

const r = (id: string, name: string, lines: [string, number, string][], meals?: Recipe['meals']): Recipe => ({
  id, name, serves: 4, time: '1 hr', notes: '', version: 1, ...(meals ? { meals } : {}),
  ingredients: lines.map(([ingredientId, amount, unit]) => ({ ingredientId, amount, unit })),
});

export const karahi = r('K', 'Karahi', [['Chicken', 1, 'kg'], ['Onion', 2, 'unit']]);
export const pulao = r('P', 'Pulao', [['Chicken', 1, 'kg'], ['Rice', 500, 'g']]);
export const daal = r('D', 'Daal', [['Daal', 300, 'g'], ['Onion', 1, 'unit']]);
export const odd = r('O', 'Odd', [['Salt', 2, 'handful']]);
export const recipes = [karahi, pulao, daal, odd];

export const stockEvent = (id: string, ingredientId: string, amount: number | null): KitchenEvent =>
  makeEvent('set-stock', [{ ingredientId, delta: amount ?? 0, basis: amount === null ? 'unknown' : 'measured', setTo: amount }], new Date('2026-10-04T00:00:00Z'), { id }, 'Asia/Karachi');

/** Chicken 1.5 kg, Onion 6, Rice 3 kg, Daal 1 kg, Salt not sure. */
export const baseEvents = (): KitchenEvent[] => [
  stockEvent('s1', 'Chicken', 1500), stockEvent('s2', 'Onion', 6), stockEvent('s3', 'Rice', 3000),
  stockEvent('s4', 'Daal', 1000), stockEvent('s5', 'Salt', null),
];
export const stockFor = (events: KitchenEvent[]) => balances(events);

export const meal = (id: string, localDate: string, slot: PlannedMeal['slot'], recipeIds: string[], servings = 4): PlannedMeal => ({
  id, localDate, slot, servings, status: 'planned',
  items: recipeIds.map(rid => ({ kind: 'dish' as const, recipeId: rid, recipeName: recipes.find(x => x.id === rid)?.name ?? rid })),
});
