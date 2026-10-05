import { describe, expect, it } from 'vitest';
import type { RecipeDraft } from '../gemini/drafts';
import {
  buildDish, dishAliases, draftLines, lineProblem, makeNewIngredient, newIngredientId, newRecipeId, parseAmountText,
  searchIngredients, stockSummary, suggestIngredients, type DishMeta, type DraftLine,
} from './dishDraft';
import { balances, makeEvent } from './ledger';
import { availability } from './suggest';
import type { Ingredient } from './types';
import { toBase } from './units';

const ing = (id: string, name: string, dimension: Ingredient['dimension'], extra: Partial<Ingredient> = {}): Ingredient => ({
  id, name, aliases: [], dimension, displayUnit: dimension === 'mass' ? 'g' : 'pc', aisle: 'Pantry', ...extra,
});
const ingredients: Ingredient[] = [
  ing('Chicken', 'Chicken', 'mass', { displayUnit: 'kg' }),
  ing('Beef_Boneless', 'Beef Boneless', 'mass', { displayUnit: 'kg' }),
  ing('Onion', 'Onion', 'count', { aliases: ['pyaz'], conversions: { unit: 1 } }),
  ing('Salt', 'Salt', 'count', { displayUnit: 'tsp', conversions: { tsp: 1 } }),
  ing('Yogurt', 'Yogurt', 'count', { aliases: ['dahi'], displayUnit: 'cup', conversions: { cup: 1 } }),
  ing('Masoor_Daal', 'Masoor Daal', 'mass'),
  ing('Soy_Sauce', 'Soy Sauce', 'volume', { displayUnit: 'tbsp', conversions: { tbsp: 15 } }),
];

const draft = (lines: RecipeDraft['ingredients']): RecipeDraft => ({
  title: 'Haleem', serves: 6, time: '3 hr', ingredients: lines, steps: ['Cook it.'],
  sourceUrl: 'https://foodfusion.com/recipe/haleem/', videoUrl: null, checkedOn: '2026-10-05',
});
const line = (name: string, amount: number | null, unit: string | null, optional = false) => ({ name, amount, unit, optional });
const meta = (over: Partial<DishMeta> = {}): DishMeta => ({
  id: 'U-0a1b2c3d', name: 'Haleem', serves: 6, time: '3 hr', steps: ['Cook it.'], aliases: ['haleem'],
  source: { url: 'https://foodfusion.com/recipe/haleem/', name: 'Food Fusion', checkedOn: '2026-10-05' }, videoUrl: null, ...over,
});
const byId = new Map(ingredients.map(i => [i.id, i]));

describe('draftLines: matched vs flagged', () => {
  const lines = draftLines(draft([
    line('onions', 2, 'pc'), line('Chicken', 500, 'g'), line('boneless chicken', 500, 'g'),
    line('cracked wheat', 1, 'cup'), line('dahi', 1, 'cup'),
  ]), ingredients);

  it('matches an exact name, a plural or an alias on its own', () => {
    expect(lines[0]).toMatchObject({ auto: true, match: { kind: 'have', ingredientId: 'Onion' } });
    expect(lines[1]).toMatchObject({ auto: true, match: { ingredientId: 'Chicken' } });
    expect(lines[4]).toMatchObject({ auto: true, match: { ingredientId: 'Yogurt' } });
  });

  it('flags a near or unknown name instead of guessing', () => {
    expect(lines[2]).toMatchObject({ auto: false, match: null });
    expect(lines[3]).toMatchObject({ auto: false, match: null });
  });

  it('keeps the written amount as exact text and the unit in its short form', () => {
    expect(lines[0].amountText).toBe('2');
    expect(draftLines(draft([line('salt', 0.75, 'tsp'), line('pepper', null, null)]), ingredients).map(l => [l.amountText, l.unit]))
      .toEqual([['0.75', 'tsp'], ['', '']]);
  });
});

describe('suggestIngredients and searchIngredients', () => {
  it('offers her ingredients that share a word, the closest first', () => {
    expect(suggestIngredients('boneless chicken', ingredients).map(i => i.id)).toEqual(['Chicken', 'Beef_Boneless']);
    expect(suggestIngredients('masur dal', ingredients).map(i => i.id)).toEqual(['Masoor_Daal']);
    expect(suggestIngredients('cracked wheat', ingredients)).toEqual([]);
  });

  it('searches names, aliases and spellings as she types', () => {
    expect(searchIngredients('pya', ingredients).map(i => i.id)).toEqual(['Onion']);
    expect(searchIngredients('dahi', ingredients).map(i => i.id)).toEqual(['Yogurt']);
    expect(searchIngredients('boneless', ingredients).map(i => i.id)).toEqual(['Beef_Boneless']);
    expect(searchIngredients('zzz', ingredients)).toEqual([]);
    expect(searchIngredients('', ingredients, 3)).toHaveLength(3);
  });
});

describe('parseAmountText: exact numeric entry', () => {
  it.each([
    ['2', 2], ['1.5', 1.5], ['1,5', 1.5], ['.5', 0.5], ['1/2', 0.5], ['1 1/2', 1.5], ['½', 0.5], ['1½', 1.5], ['100000', 100000], ['0.75', 0.75],
  ])('%s is %s', (text, value) => {
    expect(parseAmountText(text)).toEqual({ ok: true, value });
  });
  it('treats empty as "no amount yet"', () => {
    expect(parseAmountText('  ')).toEqual({ ok: true, value: null });
  });
  it.each(['0', '-2', 'abc', '1e3', '100001', '2 kg', '1/0', '1..5', 'NaN', 'Infinity'])('refuses %s', text => {
    expect(parseAmountText(text)).toEqual({ ok: false });
  });
});

describe('lineProblem', () => {
  const base: DraftLine = { key: 'a', name: 'x', amountText: '500', unit: 'g', optional: false, included: true, auto: false, match: { kind: 'have', ingredientId: 'Chicken' } };

  it('is fine when matched, numeric and convertible', () => {
    expect(lineProblem(base, byId)).toBeNull();
  });
  it('flags an unmatched line', () => {
    expect(lineProblem({ ...base, match: null }, byId)).toMatchObject({ code: 'unmatched', message: 'Which of yours is this?' });
  });
  it('flags a missing or invalid amount', () => {
    expect(lineProblem({ ...base, amountText: '' }, byId)).toMatchObject({ code: 'amount' });
    expect(lineProblem({ ...base, amountText: '0' }, byId)).toMatchObject({ code: 'amount' });
    expect(lineProblem({ ...base, amountText: 'two' }, byId)).toMatchObject({ code: 'amount' });
  });
  it('flags a unit that cannot convert as "needs a unit"', () => {
    expect(lineProblem({ ...base, unit: 'cup' }, byId)).toMatchObject({ code: 'unit', message: 'needs a unit' }); // chicken has no cup rule
    expect(lineProblem({ ...base, unit: '' }, byId)).toMatchObject({ code: 'unit' });
    expect(lineProblem({ ...base, unit: 'ml' }, byId)).toMatchObject({ code: 'unit' }); // weight vs volume
  });
  it('never flags a line she left out', () => {
    expect(lineProblem({ ...base, match: null, included: false }, byId)).toBeNull();
  });
});

describe('buildDish', () => {
  const good = (): DraftLine[] => draftLines(draft([line('onions', 3, 'pc'), line('chicken', 500, 'g'), line('salt', 2, 'tsp', true)]), ingredients);

  it('builds a personal recipe with the required fields', () => {
    const built = buildDish(good(), ingredients, meta({ aliases: ['haleem', 'Beef Haleem'], videoUrl: 'https://youtu.be/real' }));
    expect(built.flagged).toBe(0);
    expect(built.newIngredients).toEqual([]);
    expect(built.recipe).toMatchObject({
      id: 'U-0a1b2c3d', name: 'Haleem', serves: 6, version: 1, personal: true, category: 'My recipes', meals: ['lunch', 'dinner'],
      aliases: ['haleem', 'Beef Haleem'].filter(a => a !== 'Haleem'.toLowerCase() || false),
      source: { url: 'https://foodfusion.com/recipe/haleem/', name: 'Food Fusion', checkedOn: '2026-10-05' },
      writtenUrl: 'https://foodfusion.com/recipe/haleem/', videoUrl: 'https://youtu.be/real',
    });
    expect(built.recipe.ingredients).toEqual([
      { ingredientId: 'Onion', amount: 3, unit: 'pc' },
      { ingredientId: 'Chicken', amount: 500, unit: 'g' },
      { ingredientId: 'Salt', amount: 2, unit: 'tsp', optional: true },
    ]);
  });

  it('keeps the typed name and the found title as aliases (the title only when different)', () => {
    expect(dishAliases('korma', 'Chicken Korma')).toEqual(['korma', 'Chicken Korma']);
    expect(dishAliases('Haleem', 'haleem')).toEqual(['Haleem']);
    expect(dishAliases('  ', 'Haleem')).toEqual(['Haleem']);
  });

  it('leaves flagged lines out of the recipe and counts them, so saving can be blocked', () => {
    const lines = draftLines(draft([line('chicken', 500, 'g'), line('cracked wheat', 1, 'cup'), line('onion', null, 'pc')]), ingredients);
    const built = buildDish(lines, ingredients, meta());
    expect(built.flagged).toBe(2);
    expect(built.problems.get('l1')?.code).toBe('unmatched');
    expect(built.problems.get('l2')?.code).toBe('amount');
    expect(built.recipe.ingredients.map(i => i.ingredientId)).toEqual(['Chicken']);
  });

  it('drops a line she left out, and an unresolved line she left out does not block', () => {
    const lines = draftLines(draft([line('chicken', 500, 'g'), line('cracked wheat', 1, 'cup')]), ingredients);
    lines[1] = { ...lines[1], included: false };
    const built = buildDish(lines, ingredients, meta());
    expect(built.flagged).toBe(0);
    expect(built.recipe.ingredients).toHaveLength(1);
  });

  it('resolves a flagged line by matching it to her ingredient', () => {
    const lines = draftLines(draft([line('boneless chicken', 500, 'g')]), ingredients);
    expect(buildDish(lines, ingredients, meta()).flagged).toBe(1);
    lines[0] = { ...lines[0], match: { kind: 'have', ingredientId: 'Chicken' } };
    const built = buildDish(lines, ingredients, meta());
    expect(built.flagged).toBe(0);
    expect(built.recipe.ingredients).toEqual([{ ingredientId: 'Chicken', amount: 500, unit: 'g' }]);
  });

  it('creates a new ingredient from a "New ingredient" choice', () => {
    const lines = draftLines(draft([line('cracked wheat', 250, 'g'), line('cracked wheat', 1, 'cup')]), ingredients);
    const spec = { id: 'Cracked_Wheat', name: 'Cracked wheat', measure: 'mass' as const, aisle: 'Pantry/Dry Goods' };
    lines[0] = { ...lines[0], match: { kind: 'new', spec } };
    lines[1] = { ...lines[1], included: false };
    const built = buildDish(lines, ingredients, meta());
    expect(built.flagged).toBe(0);
    expect(built.newIngredients).toEqual([{ id: 'Cracked_Wheat', name: 'Cracked wheat', aliases: [], dimension: 'mass', displayUnit: 'g', aisle: 'Pantry/Dry Goods' }]);
    expect(built.recipe.ingredients).toEqual([{ ingredientId: 'Cracked_Wheat', amount: 250, unit: 'g' }]);
    expect(built.ingredientsById.has('Cracked_Wheat')).toBe(true);
  });

  it('does not create an ingredient twice when it already exists (saved earlier by Add to list)', () => {
    const spec = { id: 'Cracked_Wheat', name: 'Cracked wheat', measure: 'mass' as const, aisle: 'Pantry' };
    const existing = [...ingredients, makeNewIngredient(spec, 'g')];
    const lines = draftLines(draft([line('cracked wheat', 250, 'g')]), existing);
    lines[0] = { ...lines[0], match: { kind: 'new', spec } };
    const built = buildDish(lines, existing, meta());
    expect(built.newIngredients).toEqual([]);
    expect(built.flagged).toBe(0);
  });

  it('flags a new weight ingredient measured in cups until a unit that converts is chosen', () => {
    const spec = { id: 'Cracked_Wheat', name: 'Cracked wheat', measure: 'mass' as const, aisle: 'Pantry' };
    const lines = draftLines(draft([line('cracked wheat', 1, 'cup')]), ingredients);
    lines[0] = { ...lines[0], match: { kind: 'new', spec } };
    expect(buildDish(lines, ingredients, meta()).problems.get('l0')).toMatchObject({ code: 'unit' });
    lines[0] = { ...lines[0], unit: 'kg', amountText: '0.25' };
    expect(buildDish(lines, ingredients, meta()).flagged).toBe(0);
  });

  it('adds up two lines that were both matched to the same ingredient', () => {
    const lines = draftLines(draft([line('onion', 2, 'pc'), line('pyaz', 1, 'pc')]), ingredients);
    expect(buildDish(lines, ingredients, meta()).recipe.ingredients).toEqual([{ ingredientId: 'Onion', amount: 3, unit: 'pc' }]);
  });

  it('bounds serves between 1 and 30 and never leaves the name empty', () => {
    expect(buildDish(good(), ingredients, meta({ serves: 99 })).recipe.serves).toBe(30);
    expect(buildDish(good(), ingredients, meta({ serves: 0 })).recipe.serves).toBe(1);
    expect(buildDish(good(), ingredients, meta({ name: '   ' })).recipe.name).toBe('New dish');
  });
});

describe('new ingredients', () => {
  it('makes ids that do not clash', () => {
    expect(newIngredientId('cracked wheat', [])).toBe('Cracked_Wheat');
    expect(newIngredientId('Cracked  Wheat!', ['Cracked_Wheat'])).toBe('Cracked_Wheat_2');
    expect(newIngredientId('قورمہ', [])).toBe('Ingredient');
  });
  it('gives volume ingredients tsp, tbsp and cup, and household count units a rule', () => {
    const oil = makeNewIngredient({ id: 'O', name: 'Oil', measure: 'volume', aisle: 'x' }, 'tbsp');
    expect(toBase(2, 'tbsp', oil)).toEqual({ ok: true, value: 30 });
    const herb = makeNewIngredient({ id: 'H', name: 'Dill', measure: 'count', aisle: 'x' }, 'bunch');
    expect(herb).toMatchObject({ displayUnit: 'bunch', conversions: { bunch: 1 } });
    expect(toBase(2, 'bunch', herb)).toEqual({ ok: true, value: 2 });
    expect(toBase(1, 'cup', herb).ok).toBe(false);
  });
  it('makes recipe ids U- plus 8 hex digits', () => {
    expect(newRecipeId()).toMatch(/^U-[0-9a-f]{8}$/);
    expect(newRecipeId(() => new Uint8Array([1, 2, 255, 16]))).toBe('U-0102ff10');
  });
});

describe('stockSummary: "You have 9 of 12"', () => {
  const stockOf = (amounts: Record<string, number>) => balances(
    Object.entries(amounts).map(([ingredientId, delta]) =>
      makeEvent('purchase', [{ ingredientId, delta, basis: 'measured' }], new Date('2026-10-01T09:00:00+05:00'))),
  );

  it('counts what is in stock, names what is short and recomputes for other servings', () => {
    const lines = draftLines(draft([line('chicken', 600, 'g'), line('onion', 3, 'pc'), line('salt', 2, 'tsp'), line('yogurt', 1, 'cup', true)]), ingredients);
    const { recipe, ingredientsById } = buildDish(lines, ingredients, meta({ serves: 6 }));
    const stock = stockOf({ Chicken: 600, Onion: 2 });
    const six = stockSummary(availability(recipe, 6, stock, ingredientsById, toBase));
    expect(six.total).toBe(3); // the optional yogurt is not counted
    expect(six.have).toBe(1);
    expect(six.short.map(s => [s.ingredientId, s.amount])).toEqual([['Onion', 1], ['Salt', 2]]);
    const three = stockSummary(availability(recipe, 3, stock, ingredientsById, toBase));
    expect(three.have).toBe(2);
    expect(three.short.map(s => s.ingredientId)).toEqual(['Salt']);
  });

  it('treats a not-sure stock as something to check, not as enough', () => {
    const lines = draftLines(draft([line('chicken', 600, 'g')]), ingredients);
    const { recipe, ingredientsById } = buildDish(lines, ingredients, meta());
    const unsure = balances([makeEvent('set-stock', [{ ingredientId: 'Chicken', delta: 0, basis: 'unknown', setTo: null }], new Date('2026-10-01T09:00:00+05:00'))]);
    const s = stockSummary(availability(recipe, 6, unsure, ingredientsById, toBase));
    expect(s).toMatchObject({ have: 0, unsure: ['Chicken'], short: [] });
  });
});
