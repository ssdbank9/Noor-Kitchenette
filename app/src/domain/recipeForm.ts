// Noor's own recipes (F40): the form's data, and the one function that turns it into a Recipe.
// Everything here is plain data and plain functions so it can be tested without a screen.
// Text typed by a person is kept as plain text only: control characters are removed, and
// links must be ordinary web links (safeHttpUrl).

import { safeHttpUrl } from '../gemini/sanitize';
import type { Dimension, Ingredient, MealSlot, Recipe } from './types';
import { KNOWN_UNITS, matchIngredient, normaliseUnit, toBase } from './units';

export const MY_RECIPES = 'My recipes';
export const MEAL_CHOICES: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'chai', label: 'Chai' },
  { id: 'dinner', label: 'Dinner' },
];
export const TIME_CHIPS = ['15 min', '30 min', '45 min', '60 min'] as const;
/** Units offered when Noor creates an ingredient herself: the unit decides how it is counted. */
export const NEW_INGREDIENT_UNITS = ['kg', 'g', 'L', 'ml', 'pc', 'bunch'] as const;
export const DEFAULT_AISLES = ['Produce', 'Meat', 'Dairy', 'Spices/Masala', 'Pantry/Dry Goods', 'Canned/Legumes'] as const;

export const MAX_SERVES = 30;
const MAX_STEPS = 40;
const MAX_ALIASES = 12;

export interface IngredientRowForm {
  /** Only for the screen's list keys. */
  key: string;
  ingredientId: string;
  /** What is in the amount box, exactly as typed. */
  amount: string;
  unit: string;
  /** An optional ingredient should stay optional when the recipe is edited (AR10). */
  optional?: boolean;
}

export interface StepForm {
  key: string;
  text: string;
}

export interface RecipeForm {
  name: string;
  serves: number;
  /** Free text, e.g. "30 min" or "1 hr 15 min". */
  time: string;
  category: string;
  meals: MealSlot[];
  rows: IngredientRowForm[];
  /** Ingredients created in this form; only the ones a row uses are saved. */
  newIngredients: Ingredient[];
  steps: StepForm[];
  notes: string;
  writtenUrl: string;
  videoUrl: string;
  /** Other spellings, comma separated. */
  aliases: string;
}

export type RecipeFormResult =
  | { ok: true; recipe: Recipe; newIngredients: Ingredient[] }
  | { ok: false; errors: string[] };

let keyCounter = 0;
export const newKey = (): string => `k${++keyCounter}`;

export function emptyForm(defaultServings = 4): RecipeForm {
  return {
    name: '',
    serves: clampServes(defaultServings),
    time: '',
    category: MY_RECIPES,
    meals: ['lunch', 'dinner'],
    rows: [],
    newIngredients: [],
    steps: [],
    notes: '',
    writtenUrl: '',
    videoUrl: '',
    aliases: '',
  };
}

/** The form for editing `recipe`. Amounts are shown without float noise. */
export function formFromRecipe(recipe: Recipe): RecipeForm {
  return {
    name: recipe.name,
    serves: clampServes(recipe.serves),
    time: recipe.time,
    category: recipe.category ?? '',
    meals: recipe.meals ? [...recipe.meals] : [],
    rows: recipe.ingredients.map(i => ({
      key: newKey(),
      ingredientId: i.ingredientId,
      amount: formatAmountText(i.amount),
      unit: normaliseUnit(i.unit) ?? i.unit,
      optional: i.optional,
    })),
    newIngredients: [],
    steps: (recipe.steps ?? []).map(text => ({ key: newKey(), text })),
    notes: recipe.notes,
    writtenUrl: recipe.writtenUrl ?? '',
    videoUrl: recipe.videoUrl ?? '',
    aliases: (recipe.aliases ?? []).join(', '),
  };
}

const clampServes = (n: number) => Math.min(MAX_SERVES, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

export function formatAmountText(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** Plain text: no control characters (new lines are kept when `multiline`), trimmed, capped. */
export function plainText(value: string, max: number, multiline = false): string {
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ');
  const text = multiline ? stripped.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n') : stripped.replace(/\s+/g, ' ');
  return text.trim().slice(0, max);
}

/** An amount typed by hand: a plain number above zero ("1,5" means 1.5). Null when blank, negative or not a number. */
export function parseAmountText(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null;
}

// ---- units and amounts for a picked ingredient ----

/** Units that toBase accepts for this ingredient; its display unit when none do. */
export function unitOptions(ingredient: Ingredient): string[] {
  const ok = KNOWN_UNITS.filter(u => toBase(1, u, ingredient).ok);
  return ok.length > 0 ? [...ok] : [normaliseUnit(ingredient.displayUnit) ?? ingredient.displayUnit];
}

/** The unit a row starts with: grams or ml for weighed things, otherwise the display unit. */
export function defaultUnit(ingredient: Ingredient): string {
  const options = unitOptions(ingredient);
  const display = normaliseUnit(ingredient.displayUnit);
  if (display === 'kg' && options.includes('g')) return 'g';
  if (display === 'L' && options.includes('ml')) return 'ml';
  return display && options.includes(display) ? display : options[0];
}

const STEP_BY_UNIT: Record<string, number> = { g: 50, kg: 0.25, ml: 50, L: 0.25, pc: 1, dozen: 1, bunch: 1, clove: 1, sprig: 1, inch: 1 };
const CHIPS_BY_UNIT: Record<string, number[]> = {
  g: [50, 100, 250, 500],
  kg: [0.25, 0.5, 1, 2],
  ml: [100, 250, 500, 1000],
  L: [0.5, 1, 2, 5],
  pc: [1, 2, 3, 4, 6],
  dozen: [0.5, 1, 2],
  bunch: [0.5, 1, 2],
};

export const amountStep = (unit: string): number => STEP_BY_UNIT[unit] ?? 0.5;
export const amountChips = (unit: string): number[] => CHIPS_BY_UNIT[unit] ?? [0.5, 1, 2, 3];
export const defaultAmountText = (unit: string): string => formatAmountText(amountChips(unit)[unit === 'g' || unit === 'ml' ? 1 : unit === 'pc' ? 0 : 1] ?? 1);

/** The amount box after pressing + or - (never below one step, never negative). */
export function stepAmountText(text: string, unit: string, direction: 1 | -1): string {
  const step = amountStep(unit);
  const current = parseAmountText(text) ?? 0;
  const next = Math.max(step, current + direction * step);
  return formatAmountText(next);
}

// ---- creating an ingredient ----

const DIMENSION_OF_UNIT: Record<string, Dimension> = { g: 'mass', kg: 'mass', ml: 'volume', L: 'volume', pc: 'count', dozen: 'count', bunch: 'count' };

export type NewIngredientResult = { ok: true; ingredient: Ingredient } | { ok: false; error: string };

/** A new ingredient from a name, a unit and an aisle. The unit decides its dimension. */
export function makeNewIngredient(
  input: { name: string; unit: string; aisle: string },
  existing: Ingredient[],
  hex: () => string = randomHex,
): NewIngredientResult {
  const name = plainText(input.name, 60);
  if (!name) return { ok: false, error: 'Give the ingredient a name.' };
  const same = matchIngredient(name, existing);
  if (same) return { ok: false, error: `${same.name} is already in your kitchen. Pick it from the list.` };
  const unit = normaliseUnit(input.unit);
  const dimension = unit ? DIMENSION_OF_UNIT[unit] : undefined;
  if (!unit || !dimension) return { ok: false, error: 'Pick how this ingredient is counted: kg, g, L, ml, pieces or bunch.' };
  const aisle = plainText(input.aisle, 40);
  if (!aisle) return { ok: false, error: 'Pick the aisle it is found in.' };

  const base = name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('_');
  const taken = new Set(existing.map(i => i.id));
  let id = base || `I_${hex()}`;
  for (let n = 2; taken.has(id); n++) id = `${base || 'I'}_${n}`;
  return {
    ok: true,
    ingredient: {
      id,
      name,
      aliases: [],
      dimension,
      displayUnit: unit,
      aisle,
      ...(unit === 'bunch' ? { conversions: { bunch: 1 } } : {}),
    },
  };
}

// ---- turning the form into a recipe ----

function randomHex(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A valid Recipe from the form, or every problem in plain words. A new recipe gets the id
 * `U-<8 hex>`, `personal: true` and version 1. Editing keeps the id, `personal` and any
 * source or alternative links, and raises `version` by one, so an app update that improves
 * a starter recipe never overwrites Noor's edit (refreshStarter.ts).
 */
export function recipeFromForm(
  form: RecipeForm,
  existing?: Recipe,
  context: { ingredients: Ingredient[]; hex?: () => string } = { ingredients: [] },
): RecipeFormResult {
  const errors: string[] = [];
  const pool = [...context.ingredients, ...form.newIngredients];
  const byId = new Map(pool.map(i => [i.id, i]));

  const name = plainText(form.name, 80);
  if (!name) errors.push('Give the dish a name.');

  if (!Number.isInteger(form.serves) || form.serves < 1 || form.serves > MAX_SERVES) {
    errors.push(`Say how many people it serves (1 to ${MAX_SERVES}).`);
  }

  const lines: Recipe['ingredients'] = [];
  const used = new Set<string>();
  if (form.rows.length === 0) errors.push('Add at least one ingredient.');
  form.rows.forEach((row, i) => {
    const ingredient = byId.get(row.ingredientId);
    if (!ingredient) { errors.push(`Ingredient ${i + 1}: pick an ingredient.`); return; }
    const label = ingredient.name;
    if (used.has(ingredient.id)) { errors.push(`${label} is listed twice. Keep one line for it.`); return; }
    used.add(ingredient.id);
    const amount = parseAmountText(row.amount);
    if (amount === null) { errors.push(`${label}: type an amount above zero, like 250 or 1.5.`); return; }
    const unit = normaliseUnit(row.unit);
    const converted = unit ? toBase(amount, unit, ingredient) : null;
    if (!unit || !converted?.ok) { errors.push(`${label}: pick a unit that works for it.`); return; }
    lines.push({ ingredientId: ingredient.id, amount, unit, ...(row.optional ? { optional: true } : {}) });
  });

  const writtenUrl = form.writtenUrl.trim() ? safeHttpUrl(form.writtenUrl) : null;
  if (form.writtenUrl.trim() && !writtenUrl) errors.push('The written recipe link must start with http:// or https://.');
  const videoUrl = form.videoUrl.trim() ? safeHttpUrl(form.videoUrl) : null;
  if (form.videoUrl.trim() && !videoUrl) errors.push('The video link must start with http:// or https://.');

  const steps = form.steps.map(s => plainText(s.text, 600)).filter(Boolean);
  if (steps.length > MAX_STEPS) errors.push(`Keep it to ${MAX_STEPS} steps or fewer.`);

  const aliases = [...new Set(form.aliases.split(/[,\n;،]/).map(a => plainText(a, 60)).filter(Boolean))].slice(0, MAX_ALIASES);

  if (errors.length > 0) return { ok: false, errors };

  const meals = MEAL_CHOICES.map(m => m.id).filter(id => form.meals.includes(id));
  const category = plainText(form.category, 40);
  const recipe: Recipe = {
    ...(existing ?? {}),
    id: existing?.id ?? `U-${(context.hex ?? randomHex)()}`,
    name,
    serves: form.serves,
    time: plainText(form.time, 30),
    notes: plainText(form.notes, 1500, true),
    ingredients: lines,
    version: (existing?.version ?? 0) + 1,
    ...(existing ? {} : { personal: true }),
  };
  // Optional fields are set or removed, never left holding an old value.
  const optional = { category: category || undefined, meals: meals.length ? meals : undefined, writtenUrl: writtenUrl ?? undefined, videoUrl: videoUrl ?? undefined, steps: steps.length ? steps : undefined, aliases: aliases.length ? aliases : undefined };
  for (const [key, value] of Object.entries(optional)) {
    if (value === undefined) delete (recipe as unknown as Record<string, unknown>)[key];
    else (recipe as unknown as Record<string, unknown>)[key] = value;
  }
  const newIngredients = form.newIngredients.filter(i => used.has(i.id) && !context.ingredients.some(e => e.id === i.id));
  return { ok: true, recipe, newIngredients };
}

// ---- small helpers for the editor ----

/** `list` with the item at `index` moved one place up (-1) or down (1); the same list at the ends. */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Ingredients matching what was typed: by name, alias or part of one; not the ones already used. */
export function searchIngredients(query: string, pool: Ingredient[], usedIds: Set<string>, max = 8): Ingredient[] {
  const q = query.trim().toLowerCase();
  const left = pool.filter(i => !usedIds.has(i.id));
  if (!q) return left.slice(0, max);
  const labels = (i: Ingredient) => [i.name, ...i.aliases].map(l => l.toLowerCase());
  const starts = left.filter(i => labels(i).some(l => l.startsWith(q) || l.split(/\s+/).some(w => w.startsWith(q))));
  const inside = left.filter(i => !starts.includes(i) && labels(i).some(l => l.includes(q)));
  return [...starts, ...inside].slice(0, max);
}

/** Adds or replaces a recipe in saved data (used for the in-memory copy next to the database write). */
export function withRecipe<T extends { recipes: Recipe[]; ingredients: Ingredient[] }>(data: T, recipe: Recipe, newIngredients: Ingredient[]): T {
  const known = new Set(data.ingredients.map(i => i.id));
  const recipes = data.recipes.some(r => r.id === recipe.id)
    ? data.recipes.map(r => (r.id === recipe.id ? recipe : r))
    : [...data.recipes, recipe];
  return { ...data, recipes, ingredients: [...data.ingredients, ...newIngredients.filter(i => !known.has(i.id))] };
}

export const withoutRecipe = <T extends { recipes: Recipe[] }>(data: T, recipeId: string): T => ({
  ...data,
  recipes: data.recipes.filter(r => r.id !== recipeId),
});
