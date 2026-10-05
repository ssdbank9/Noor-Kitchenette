import { describe, expect, it } from 'vitest';
import {
  amountChips, defaultUnit, emptyForm, formFromRecipe, makeNewIngredient, moveItem, parseAmountText, recipeFromForm,
  searchIngredients, stepAmountText, unitOptions, withRecipe, withoutRecipe, type RecipeForm,
} from './recipeForm';
import type { Ingredient, Recipe } from './types';

const rice: Ingredient = { id: 'Basmati_Rice', name: 'Basmati Rice', aliases: ['chawal'], dimension: 'mass', displayUnit: 'kg', aisle: 'Pantry/Dry Goods' };
const eggs: Ingredient = { id: 'Eggs', name: 'Eggs', aliases: ['anday'], dimension: 'count', displayUnit: 'pc', aisle: 'Dairy' };
const milk: Ingredient = { id: 'Milk', name: 'Milk', aliases: [], dimension: 'volume', displayUnit: 'L', aisle: 'Dairy', conversions: { cup: 240 } };
const pool = [rice, eggs, milk];
const ctx = { ingredients: pool, hex: () => '0a1b2c3d' };

function valid(over: Partial<RecipeForm> = {}): RecipeForm {
  return {
    ...emptyForm(4),
    name: 'My test dish',
    time: '30 min',
    rows: [{ key: 'a', ingredientId: 'Eggs', amount: '2', unit: 'pc' }, { key: 'b', ingredientId: 'Basmati_Rice', amount: '250', unit: 'g' }],
    steps: [{ key: 's1', text: 'Beat the eggs.' }, { key: 's2', text: 'Cook.' }],
    ...over,
  };
}
const errors = (form: RecipeForm, existing?: Recipe) => {
  const r = recipeFromForm(form, existing, ctx);
  if (r.ok) throw new Error('expected errors');
  return r.errors;
};
const row = (ingredientId: string, amount: string, unit: string, key = ingredientId) => ({ key, ingredientId, amount, unit });

describe('recipeFromForm', () => {
  it('builds a new personal recipe with id U-<8 hex>, version 1, defaults lunch and dinner', () => {
    const r = recipeFromForm(valid(), undefined, ctx);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.recipe).toEqual({
      id: 'U-0a1b2c3d', name: 'My test dish', serves: 4, time: '30 min', notes: '', category: 'My recipes',
      meals: ['lunch', 'dinner'], steps: ['Beat the eggs.', 'Cook.'],
      ingredients: [{ ingredientId: 'Eggs', amount: 2, unit: 'pc' }, { ingredientId: 'Basmati_Rice', amount: 250, unit: 'g' }],
      version: 1, personal: true,
    });
    expect(r.newIngredients).toEqual([]);
  });

  it('makes a random id of the right shape when none is injected', () => {
    const r = recipeFromForm(valid(), undefined, { ingredients: pool });
    expect(r.ok && r.recipe.id).toMatch(/^U-[0-9a-f]{8}$/);
  });

  it('reports each problem in plain words', () => {
    expect(errors(valid({ name: '  ' }))).toContain('Give the dish a name.');
    expect(errors(valid({ serves: 0 }))[0]).toMatch(/how many people/);
    expect(errors(valid({ serves: 31 }))[0]).toMatch(/how many people/);
    expect(errors(valid({ rows: [] }))).toContain('Add at least one ingredient.');
    expect(errors(valid({ rows: [row('', '1', 'pc', 'a')] }))[0]).toMatch(/pick an ingredient/);
    expect(errors(valid({ rows: [row('Eggs', '', 'pc')] }))[0]).toMatch(/Eggs: type an amount/);
    expect(errors(valid({ rows: [row('Eggs', '-2', 'pc')] }))[0]).toMatch(/Eggs: type an amount/);
    expect(errors(valid({ rows: [row('Eggs', '0', 'pc')] }))[0]).toMatch(/Eggs: type an amount/);
    expect(errors(valid({ rows: [row('Eggs', '2', 'kg')] }))[0]).toMatch(/Eggs: pick a unit/);
    expect(errors(valid({ rows: [row('Eggs', '2', 'pc', 'a'), row('Eggs', '1', 'pc', 'b')] }))[0]).toMatch(/Eggs is listed twice/);
    expect(errors(valid({ writtenUrl: 'javascript:alert(1)' }))[0]).toMatch(/written recipe link/);
    expect(errors(valid({ videoUrl: 'not a link' }))[0]).toMatch(/video link/);
  });

  it('collects all errors at once', () => {
    expect(errors(valid({ name: '', rows: [] })).length).toBe(2);
  });

  it('keeps text plain: control characters go, blank steps are dropped, aliases are split and de-duplicated', () => {
    const r = recipeFromForm(valid({
      name: 'Dish\u0000 <b>x</b>', steps: [{ key: '1', text: ' ' }, { key: '2', text: 'Stir\u0007 well' }],
      aliases: 'korma, Korma , qorma,,', notes: 'Line one\n\n\n\nLine two\u0001',
    }), undefined, ctx);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.recipe.name).toBe('Dish <b>x</b>'); // React shows it as text; no markup is ever interpreted
    expect(r.recipe.steps).toEqual(['Stir well']);
    expect(r.recipe.aliases).toEqual(['korma', 'Korma', 'qorma']);
    expect(r.recipe.notes).toBe('Line one\n\nLine two');
  });

  it('accepts a decimal comma and http links, drops empty optional fields', () => {
    const r = recipeFromForm(valid({
      rows: [row('Milk', '1,5', 'cup')], writtenUrl: ' https://example.com/x ', steps: [], meals: [], category: '',
    }), undefined, ctx);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.recipe.ingredients[0].amount).toBe(1.5);
    expect(r.recipe.writtenUrl).toBe('https://example.com/x');
    expect(r.recipe).not.toHaveProperty('steps');
    expect(r.recipe).not.toHaveProperty('meals');
    expect(r.recipe).not.toHaveProperty('category');
  });

  it('editing bumps the version by 1, keeps id, personal and source, and a removed field stays removed', () => {
    const existing: Recipe = {
      id: 'U-deadbeef', name: 'Old', serves: 2, time: '', notes: '', version: 4, personal: true, steps: ['x'],
      source: { url: 'https://example.com', checkedOn: '2026-10-01' }, ingredients: [{ ingredientId: 'Eggs', amount: 1, unit: 'pc' }],
    };
    const r = recipeFromForm({ ...formFromRecipe(existing), name: 'New', steps: [] }, existing, ctx);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.recipe).toMatchObject({ id: 'U-deadbeef', name: 'New', version: 5, personal: true, source: existing.source });
    expect(r.recipe).not.toHaveProperty('steps');
  });

  it('editing a starter recipe bumps its version and does not make it personal', () => {
    const starter: Recipe = { id: 'R001', name: 'Biryani', serves: 6, time: '1 hr', notes: '', version: 1, ingredients: [{ ingredientId: 'Basmati_Rice', amount: 0.75, unit: 'kg' }], recommendedWrittenUrl: 'https://example.com/r' };
    const r = recipeFromForm(formFromRecipe(starter), starter, ctx);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.recipe.version).toBe(2);
    expect(r.recipe.personal).toBeUndefined();
    expect(r.recipe.recommendedWrittenUrl).toBe('https://example.com/r');
    expect(formFromRecipe(starter).rows[0].amount).toBe('0.75');
  });

  it('creates a new ingredient only when a row uses it', () => {
    const made = makeNewIngredient({ name: 'Kasuri Methi', unit: 'g', aisle: 'Spices/Masala' }, pool);
    if (!made.ok) throw new Error(made.error);
    const used = recipeFromForm(valid({
      newIngredients: [made.ingredient, { ...made.ingredient, id: 'Unused', name: 'Unused' }],
      rows: [row('Kasuri_Methi', '5', 'g')],
    }), undefined, ctx);
    if (!used.ok) throw new Error(used.errors.join());
    expect(used.newIngredients.map(i => i.id)).toEqual(['Kasuri_Methi']);
    expect(used.recipe.ingredients[0]).toEqual({ ingredientId: 'Kasuri_Methi', amount: 5, unit: 'g' });
  });
});

describe('makeNewIngredient', () => {
  it('the unit sets the dimension, bunch gets its own rule, ids are unique and readable', () => {
    const ok = (i: Parameters<typeof makeNewIngredient>[0], list = pool) => {
      const r = makeNewIngredient(i, list, () => '0a1b2c3d');
      if (!r.ok) throw new Error(r.error);
      return r.ingredient;
    };
    expect(ok({ name: 'Ajwain', unit: 'g', aisle: 'Spices/Masala' })).toMatchObject({ id: 'Ajwain', dimension: 'mass', displayUnit: 'g', aliases: [] });
    expect(ok({ name: 'Cream', unit: 'ml', aisle: 'Dairy' }).dimension).toBe('volume');
    expect(ok({ name: 'Pudina', unit: 'bunch', aisle: 'Produce' })).toMatchObject({ dimension: 'count', conversions: { bunch: 1 } });
    expect(ok({ name: 'Basmati Rice 2', unit: 'kg', aisle: 'Pantry' }).id).toBe('Basmati_Rice_2');
    expect(ok({ name: 'چائے', unit: 'g', aisle: 'x' }).id).toBe('I_0a1b2c3d');
  });
  it('refuses a blank name, a duplicate, an unknown unit and a missing aisle', () => {
    const bad = (i: Parameters<typeof makeNewIngredient>[0]) => { const r = makeNewIngredient(i, pool); return r.ok ? '' : r.error; };
    expect(bad({ name: ' ', unit: 'g', aisle: 'a' })).toMatch(/name/);
    expect(bad({ name: 'anday', unit: 'pc', aisle: 'a' })).toMatch(/already/);
    expect(bad({ name: 'Eggs', unit: 'pc', aisle: 'a' })).toMatch(/already/);
    expect(bad({ name: 'Salt', unit: 'cup', aisle: 'a' })).toMatch(/counted/);
    expect(bad({ name: 'Salt', unit: 'g', aisle: ' ' })).toMatch(/aisle/);
  });
});

describe('units and amounts', () => {
  it('offers only units toBase accepts for the ingredient', () => {
    expect(unitOptions(rice)).toEqual(['g', 'kg']);
    expect(unitOptions(eggs)).toEqual(['pc', 'dozen']);
    expect(unitOptions(milk)).toEqual(['ml', 'L', 'cup']);
  });
  it('falls back to the display unit when nothing converts', () => {
    expect(unitOptions({ ...rice, dimension: 'mass', displayUnit: 'packet' })).toEqual(['g', 'kg']);
    expect(unitOptions({ id: 'X', name: 'X', aliases: [], dimension: 'mass', displayUnit: 'packet', aisle: 'a', conversions: { packet: 0 } })).toEqual(['g', 'kg']);
  });
  it('picks a sensible start unit', () => {
    expect(defaultUnit(rice)).toBe('g');
    expect(defaultUnit(milk)).toBe('ml');
    expect(defaultUnit(eggs)).toBe('pc');
    expect(defaultUnit({ ...eggs, displayUnit: 'unit', conversions: { unit: 1 } })).toBe('pc');
  });
  it('parses typed amounts: no blank, no negative, no zero, decimal comma ok', () => {
    expect(['', ' ', '-1', '0', 'abc', '1e3', '1.2.3'].map(parseAmountText)).toEqual([null, null, null, null, null, null, null]);
    expect(['1', '1.5', '1,5', '.5', ' 250 '].map(parseAmountText)).toEqual([1, 1.5, 1.5, 0.5, 250]);
  });
  it('steppers never go below one step and chips exist for every unit', () => {
    expect(stepAmountText('50', 'g', -1)).toBe('50');
    expect(stepAmountText('', 'g', 1)).toBe('50');
    expect(stepAmountText('1', 'kg', 1)).toBe('1.25');
    expect(stepAmountText('0.1', 'pc', -1)).toBe('1');
    expect(amountChips('kg')).toContain(0.5);
    expect(amountChips('tsp').length).toBeGreaterThan(0);
  });
});

describe('editor helpers', () => {
  it('moves items up and down and stays put at the ends', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    const l = [1, 2, 3];
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 2, 1)).toBe(l);
  });
  it('searches by name, alias and word start, skipping ingredients already used', () => {
    expect(searchIngredients('ric', pool, new Set()).map(i => i.id)).toEqual(['Basmati_Rice']);
    expect(searchIngredients('anday', pool, new Set()).map(i => i.id)).toEqual(['Eggs']);
    expect(searchIngredients('eg', pool, new Set(['Eggs']))).toEqual([]);
    expect(searchIngredients('', pool, new Set()).length).toBe(3);
  });
  it('adds or replaces a recipe in saved data and deletes it by id', () => {
    const data = { ingredients: [eggs], recipes: [] as Recipe[] };
    const recipe: Recipe = { id: 'U-1', name: 'A', serves: 1, time: '', notes: '', ingredients: [], version: 1, personal: true };
    const added = withRecipe(data, recipe, [rice, eggs]);
    expect(added.ingredients.map(i => i.id)).toEqual(['Eggs', 'Basmati_Rice']);
    const edited = withRecipe(added, { ...recipe, name: 'B', version: 2 }, []);
    expect(edited.recipes).toHaveLength(1);
    expect(edited.recipes[0].name).toBe('B');
    expect(withoutRecipe(edited, 'U-1').recipes).toEqual([]);
  });
});
