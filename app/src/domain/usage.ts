// "What did you actually use?" (F61, F21). After cooking Noor may have used less or more than
// the recipe says. This file turns an Availability into one editable line per ingredient and
// turns her final amounts into stock movements. Amounts are held in base units (g, ml, pc);
// each line also carries the unit she sees and the size of one + / - tap in that unit.
import type { Availability } from './suggest';
import type { Ingredient, Movement, Recipe } from './types';
import { fromBase, normaliseUnit, toBase } from './units';

export interface UsageLine {
  ingredientId: string;
  name: string;
  optional: boolean;
  /** true when the amount can be edited and deducted. */
  editable: boolean;
  /** Why nothing is deducted, when editable is false. */
  reason?: string;
  /** The recipe's amount in base units for the chosen servings; null when not editable. */
  recipeBase: number | null;
  /** Recipe amount as shown, in `unit`. */
  recipeAmount: number;
  /** Unit shown to Noor, e.g. 'g', 'kg', 'pc', 'tsp', 'cup'. */
  unit: string;
  /** Base units in one `unit`. */
  factor: number;
  /** Size of one + / - tap, in `unit`. */
  step: number;
  /** Recorded stock in base units; null when Noor said she is not sure. */
  haveBase: number | null;
}

export interface QuickChoice {
  id: 'none' | 'half' | 'recipe' | 'more';
  label: string;
  /** Base units used when picked. */
  base: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** How far one + / - tap moves, in the displayed unit. */
export function stepFor(unit: string, recipeAmount: number): number {
  switch (unit) {
    case 'g':
    case 'ml':
      return recipeAmount < 100 ? 10 : 50;
    case 'kg':
    case 'L':
      return 0.25;
    case 'dozen':
      return 0.5;
    case 'pc':
    case 'tsp':
    case 'tbsp':
    case 'clove':
    case 'sprig':
    case 'inch':
      return 1;
    default: // cup, packet, bunch, pao...
      return recipeAmount < 2 ? 0.25 : 1;
  }
}

/** One editable line per recipe ingredient, in recipe order. */
export function buildUsage(
  availability: Availability,
  recipe: Recipe,
  ingredientsById: Map<string, Ingredient>,
): UsageLine[] {
  const scale = availability.servings / recipe.serves;
  return availability.needs.map(need => {
    const ingredient = ingredientsById.get(need.ingredientId);
    const ri = recipe.ingredients.find(r => r.ingredientId === need.ingredientId);
    const name = ingredient?.name ?? need.ingredientId;
    const base = { ingredientId: need.ingredientId, name, optional: need.optional, haveBase: need.have };

    if (ingredient && need.need !== null) {
      const shown = fromBase(need.need, ingredient);
      const factor = toBase(1, shown.unit, ingredient);
      if (factor.ok && factor.value > 0) {
        return {
          ...base, editable: true, recipeBase: need.need, recipeAmount: shown.amount, unit: shown.unit,
          factor: factor.value, step: stepFor(shown.unit, shown.amount),
        };
      }
    }

    // The recipe amount could not be converted. It is editable only in the recipe's own unit,
    // and only if that unit converts for this ingredient.
    const unit = ri ? normaliseUnit(ri.unit) ?? ri.unit : '';
    const recipeAmount = ri ? round2(ri.amount * scale) : 0;
    const one = ingredient && ri ? toBase(1, ri.unit, ingredient) : null;
    if (ingredient && ri && one && one.ok && one.value > 0) {
      return {
        ...base, editable: true, recipeBase: one.value * recipeAmount, recipeAmount, unit,
        factor: one.value, step: stepFor(unit, recipeAmount),
      };
    }
    return {
      ...base, editable: false, recipeBase: null, recipeAmount, unit, factor: 1, step: 1,
      reason: one && !one.ok ? one.reason : `${name} has no rule for ${unit || 'its unit'} yet.`,
    };
  });
}

/** None, Half, Recipe amount, 1.5x of the recipe amount. */
export function quickChoices(line: UsageLine): QuickChoice[] {
  const r = line.recipeBase ?? 0;
  return [
    { id: 'none', label: 'None', base: 0 },
    { id: 'half', label: 'Half', base: round3(r / 2) },
    { id: 'recipe', label: 'Recipe amount', base: r },
    { id: 'more', label: '1.5x', base: round3(r * 1.5) },
  ];
}

/** The amount in the line's own unit, e.g. 1250 g in a kg line -> 1.25. */
export function displayAmount(line: UsageLine, usedBase: number): number {
  return round2(usedBase / line.factor);
}

/** One + (direction 1) or - (direction -1) tap; never below zero. */
export function stepUsed(line: UsageLine, usedBase: number, direction: 1 | -1): number {
  const next = Math.max(0, round2(displayAmount(line, usedBase) + direction * line.step));
  if (line.recipeBase !== null && next === line.recipeAmount) return line.recipeBase;
  return round3(next * line.factor);
}

export type ParsedAmount = { ok: true; base: number } | { ok: false; error: string };

/** Text typed in the "Exact amount" box, in the line's unit, to base units. */
export function parseExact(line: UsageLine, text: string, ingredient: Ingredient): ParsedAmount {
  const cleaned = text.trim().replace(',', '.');
  if (!cleaned) return { ok: false, error: 'Type an amount, or 0 for none.' };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    return { ok: false, error: cleaned.startsWith('-') ? 'Amounts cannot be negative.' : 'Use numbers only, like 250 or 1.5.' };
  }
  const value = Number(cleaned);
  if (line.recipeBase !== null && round2(value) === line.recipeAmount) return { ok: true, base: line.recipeBase };
  const r = toBase(value, line.unit, ingredient);
  return r.ok ? { ok: true, base: round3(r.value) } : { ok: false, error: r.reason };
}

/** More than the recorded stock: the ledger will hold at zero and show "check stock". */
export function exceedsStock(line: UsageLine, usedBase: number): boolean {
  return line.haveBase !== null && usedBase > line.haveBase + 1e-9;
}

/** The starting amounts: exactly the recipe, per ingredient id (editable lines only). */
export function initialUsage(lines: UsageLine[]): Record<string, number> {
  return Object.fromEntries(lines.filter(l => l.editable).map(l => [l.ingredientId, l.recipeBase!]));
}

/** Stock movements for what was used: negative deltas, measured, zeros and non-editable omitted. */
export function usageMovements(lines: UsageLine[], used: Record<string, number>): Movement[] {
  return lines
    .filter(l => l.editable && (used[l.ingredientId] ?? 0) > 0)
    .map(l => ({ ingredientId: l.ingredientId, delta: -used[l.ingredientId], basis: 'measured' as const }));
}
