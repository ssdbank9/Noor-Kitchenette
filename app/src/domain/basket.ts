// This week's basket (F55, F60). It is DERIVED from the plan and the current stock every time
// and never stored, so it follows purchases, cooking, swaps and cancellations by itself.
//
//  - Needs of uncooked dishes dated today or later are added up per ingredient, across meals.
//  - Usable stock is subtracted exactly once, from the combined need.
//  - Stock that is "not sure" or flagged for checking, or a recipe unit that cannot be
//    converted, gives a "Check" line with no quantity (never a guess).
//  - Optional staple top-ups aim for the ingredient's minimum stock AFTER the planned cooking.
//  - Eating-out and leftover items add nothing: their raw ingredients are never bought here.
import { dishNeeds, pendingDishes, type CompetingMeal } from './plan';
import { groupByAisle } from './shopping';
import type { Balance } from './ledger';
import type { ToBase } from './suggest';
import type { Ingredient, KitchenEvent, PlannedMeal, Recipe } from './types';

export type BasketReason = 'planned' | 'top-up';
export type CheckWhy = 'stock-unknown' | 'stock-check' | 'unit';

export interface BasketLine {
  ingredientId: string;
  /** Base units still to buy; null means "Check": no quantity is guessed. */
  amountBase: number | null;
  /** Why it is here. A planned ingredient that is also low is ONE line with both reasons. */
  reasons: BasketReason[];
  /** Meals that need it (empty for a pure top-up). */
  meals: CompetingMeal[];
  /** Base units the planned meals need in total. */
  plannedNeed: number;
  /** Usable stock in base units (null when not known). */
  stock: number | null;
  checkWhy?: CheckWhy;
}

const EPS = 1e-9;

export interface BasketOptions {
  /** Also top staples up to their minimum, counted after the planned cooking. */
  topUps?: boolean;
}

export function basketFromPlan(
  plan: PlannedMeal[],
  recipes: Recipe[],
  stock: Map<string, Balance>,
  ingredients: Ingredient[],
  toBase: ToBase,
  today: string,
  live: ReadonlySet<string> | KitchenEvent[],
  options: BasketOptions = {},
): BasketLine[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const planned = new Map<string, { need: number; meals: CompetingMeal[]; unit: boolean }>();

  for (const p of pendingDishes(plan, recipesById, today, live)) {
    for (const n of dishNeeds(p.recipe, p.meal.servings, byId, toBase)) {
      const entry = planned.get(n.ingredientId) ?? { need: 0, meals: [], unit: false };
      const meal: CompetingMeal = {
        mealId: p.meal.id, localDate: p.meal.localDate, slot: p.meal.slot, recipeName: p.recipe.name, need: n.need ?? 0,
      };
      entry.meals.push(meal);
      if (n.need === null) entry.unit = true;
      else entry.need += n.need;
      planned.set(n.ingredientId, entry);
    }
  }

  const lines: BasketLine[] = [];
  const consider = new Set([...planned.keys(), ...(options.topUps ? ingredients.filter(i => i.minStock !== undefined).map(i => i.id) : [])]);
  for (const ing of ingredients) {
    if (!consider.has(ing.id)) continue;
    const entry = planned.get(ing.id);
    const plannedNeed = entry?.need ?? 0;
    const meals = entry?.meals ?? [];
    const b = stock.get(ing.id);
    const min = options.topUps ? ing.minStock : undefined;
    const base = { ingredientId: ing.id, meals, plannedNeed, stock: b ? b.amount : 0 };

    let checkWhy: CheckWhy | undefined;
    if (b && b.amount === null) checkWhy = 'stock-unknown';
    else if (b?.needsCheck) checkWhy = 'stock-check';
    else if (entry?.unit) checkWhy = 'unit';

    if (checkWhy) {
      const reasons: BasketReason[] = [];
      if (entry) reasons.push('planned');
      if (min !== undefined) reasons.push('top-up');
      lines.push({ ...base, amountBase: null, reasons, checkWhy });
      continue;
    }

    const have = b ? (b.amount as number) : 0;
    const plannedShort = Math.max(0, plannedNeed - have);
    // Target after the planned cooking is the minimum: need = planned + minimum - stock.
    const total = min !== undefined ? Math.max(0, plannedNeed + min - have) : plannedShort;
    if (total <= EPS) continue;
    const reasons: BasketReason[] = [];
    if (plannedShort > EPS) reasons.push('planned');
    if (total - plannedShort > EPS) reasons.push('top-up');
    lines.push({ ...base, amountBase: total, reasons });
  }
  return lines;
}

export interface BasketAisle {
  aisle: string;
  lines: BasketLine[];
}

/** Aisle grouping in the same order as the manual shopping list. */
export function groupBasketByAisle(lines: BasketLine[], ingredients: Ingredient[]): BasketAisle[] {
  const byId = new Map(lines.map(l => [l.ingredientId, l]));
  const shaped = lines.map(l => ({ ingredientId: l.ingredientId, amountBase: l.amountBase, reason: 'dish' as const, recipeIds: [] as string[] }));
  return groupByAisle(shaped, ingredients).map(g => ({ aisle: g.aisle, lines: g.items.map(i => byId.get(i.ingredientId)!) }));
}

/** The quantity text of a line: "Need 1 kg", "Still need 1 kg" (some in stock) or "Check". */
export function basketAmountText(line: BasketLine, ingredient: Ingredient, format: (base: number, ing: Ingredient) => string): string {
  if (line.amountBase === null) return 'Check';
  const label = (line.stock ?? 0) > EPS ? 'Still need' : 'Need';
  return `${label} ${format(line.amountBase, ingredient)}`;
}

/** Why a line is here, in plain words. */
export function basketWhy(line: BasketLine, ingredient: Ingredient, format: (base: number, ing: Ingredient) => string): string[] {
  const out: string[] = [];
  if (line.meals.length) {
    const names = [...new Set(line.meals.map(m => m.recipeName))];
    out.push('For ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : ''));
    if (line.plannedNeed > 0) {
      out.push(`Meals need ${format(line.plannedNeed, ingredient)}, you have ${line.stock === null ? 'not sure' : format(line.stock, ingredient)}`);
    }
  }
  if (line.reasons.includes('top-up')) out.push('so you are not below your minimum after cooking');
  if (line.checkWhy === 'stock-unknown') out.push('You are not sure how much you have');
  if (line.checkWhy === 'stock-check') out.push('Check what is left first');
  if (line.checkWhy === 'unit') out.push('An amount in the recipe cannot be converted');
  return out;
}

/** Plain text for sharing, by aisle. Empty string when the basket is empty. */
export function basketShareText(lines: BasketLine[], ingredients: Ingredient[], format: (base: number, ing: Ingredient) => string): string {
  if (lines.length === 0) return '';
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const out = ["This week's basket"];
  for (const g of groupBasketByAisle(lines, ingredients)) {
    out.push('', g.aisle);
    for (const l of g.lines) {
      const ing = byId.get(l.ingredientId);
      const name = ing?.name ?? l.ingredientId;
      out.push(`- ${name}${l.amountBase === null || !ing ? ' (check)' : ` ${format(l.amountBase, ing)}`}`);
    }
  }
  return out.join('\n');
}
