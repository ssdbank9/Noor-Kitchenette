// What can I cook now (F4, F5, F7, F32) and what should the next meal be (F81).
// One availability calculation is used everywhere (Today, recipes, planner), so a dish never
// shows "ready" in one place and "missing" in another. Amounts are compared in base units;
// the unit conversion is passed in (units.ts) so this file stays free of unit rules.
import { balances, cookingHistory, lastCooked, type Balance } from './ledger';
import type { Ingredient, KitchenEvent, MealRating, Recipe } from './types';

export type ToBase = (
  amount: number,
  unit: string,
  ingredient: Ingredient,
) => { ok: true; value: number } | { ok: false; reason: string };

export interface Need {
  ingredientId: string;
  /** Base units needed for the chosen servings; null when the unit cannot be converted. */
  need: number | null;
  have: number | null;
  /** Base units still missing; 0 when there is enough; null when unknown. */
  short: number | null;
  status: 'enough' | 'short' | 'maybe' | 'unconvertible';
  optional: boolean;
}

export interface Availability {
  recipeId: string;
  servings: number;
  /** ready: everything is there; maybe: only "not sure" items are in doubt; missing: something is short. */
  status: 'ready' | 'maybe' | 'missing';
  needs: Need[];
  /** Share of required amounts available, 0..1 (D-07 proposal). */
  coverage: number;
  missing: Need[];
}

export function availability(
  recipe: Recipe,
  servings: number,
  stock: Map<string, Balance>,
  ingredientsById: Map<string, Ingredient>,
  toBase: ToBase,
): Availability {
  const scale = servings / recipe.serves;
  const needs: Need[] = recipe.ingredients.map(ri => {
    const ingredient = ingredientsById.get(ri.ingredientId);
    const optional = Boolean(ri.optional);
    const converted = ingredient ? toBase(ri.amount * scale, ri.unit, ingredient) : null;
    const balance = stock.get(ri.ingredientId);
    const have = balance ? balance.amount : 0;
    if (!converted || !converted.ok) {
      return { ingredientId: ri.ingredientId, need: null, have, short: null, status: 'unconvertible', optional };
    }
    const need = converted.value;
    if (have === null) return { ingredientId: ri.ingredientId, need, have, short: null, status: 'maybe', optional };
    const short = Math.max(0, need - have);
    return { ingredientId: ri.ingredientId, need, have, short, status: short > 1e-9 ? 'short' : 'enough', optional };
  });

  const required = needs.filter(n => !n.optional);
  const missing = required.filter(n => n.status === 'short');
  const doubtful = required.filter(n => n.status === 'maybe' || n.status === 'unconvertible');
  const status = missing.length ? 'missing' : doubtful.length ? 'maybe' : 'ready';

  // Each ingredient counts equally; within it, the share of the amount available.
  const shares = required.map(n => {
    if (n.status === 'enough') return 1;
    if (n.status === 'short' && n.need) return Math.min(1, (n.have ?? 0) / n.need);
    return 0.5; // not sure, or no conversion rule: half credit, never "ready"
  });
  const coverage = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 1;

  return { recipeId: recipe.id, servings, status, needs, coverage, missing };
}

/** Every recipe's availability, ready first, then by coverage (F5). */
export function cookableNow(
  recipes: Recipe[],
  servings: number,
  events: KitchenEvent[],
  ingredients: Ingredient[],
  toBase: ToBase,
): Availability[] {
  const stock = balances(events);
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const order = { ready: 0, maybe: 1, missing: 2 } as const;
  return recipes
    .map(r => availability(r, servings, stock, byId, toBase))
    .sort((a, b) => order[a.status] - order[b.status] || b.coverage - a.coverage || a.recipeId.localeCompare(b.recipeId));
}

export interface Suggestion {
  recipe: Recipe;
  availability: Availability;
  score: number;
  /** Plain-words reasons shown to Noor, e.g. "You have everything". */
  reasons: string[];
}

/** The family's latest verdict on each dish. */
export function latestRatings(events: KitchenEvent[]): Map<string, MealRating> {
  const result = new Map<string, MealRating>();
  for (const c of cookingHistory(events)) {
    if (c.meal.rating && !result.has(c.meal.recipeId)) result.set(c.meal.recipeId, c.meal.rating);
  }
  return result;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86_400_000);
}

/**
 * Ranks dishes for the next meal by what is in stock, how long since each was cooked, and
 * what the family thought of it. Dishes marked "Not again" are left out.
 */
export function suggestNextMeals(
  recipes: Recipe[],
  servings: number,
  events: KitchenEvent[],
  ingredients: Ingredient[],
  toBase: ToBase,
  today: string,
  favourites: Set<string> = new Set(),
): Suggestion[] {
  const ratings = latestRatings(events);
  const last = lastCooked(events);
  const avail = new Map(cookableNow(recipes, servings, events, ingredients, toBase).map(a => [a.recipeId, a]));

  return recipes
    .filter(r => ratings.get(r.id) !== 'not-again')
    .map(recipe => {
      const a = avail.get(recipe.id)!;
      const reasons: string[] = [];
      let score = 0;

      if (a.status === 'ready') { score += 50; reasons.push('You have everything'); }
      else if (a.status === 'maybe') { score += 30; reasons.push('Check a couple of items'); }
      else { score += 30 * a.coverage; reasons.push(`Need ${a.missing.length} more ${a.missing.length === 1 ? 'item' : 'items'}`); }

      const lastDate = last.get(recipe.id);
      if (lastDate) {
        const days = daysBetween(lastDate, today);
        if (days <= 2) score -= 40; // just had it
        else score += Math.min(days, 30); // the longer ago, the more welcome, up to a month
        reasons.push(days <= 0 ? 'Made today' : days === 1 ? 'Made yesterday' : `Last made ${days} days ago`);
      } else {
        score += 15;
        reasons.push('Not cooked yet in the app');
      }

      const rating = ratings.get(recipe.id);
      if (rating === 'loved') { score += 20; reasons.push('Everyone loved it'); }
      if (favourites.has(recipe.id)) { score += 10; reasons.push('A favourite'); }

      return { recipe, availability: a, score, reasons };
    })
    .sort((x, y) => y.score - x.score || x.recipe.id.localeCompare(y.recipe.id));
}
