// From a recipe DRAFT found online to a personal Recipe Noor has checked (F80). The draft's
// ingredient names are free text, so every line is matched to one of her ingredients; a line
// that is not an exact match, has no usable amount or has a unit that cannot be converted is
// "flagged" and blocks saving until Noor fixes it or leaves the line out. Nothing is saved here.
import type { RecipeDraft } from '../gemini/drafts';
import { normalizeDishName } from './dishMatch';
import type { Availability } from './suggest';
import type { Dimension, Ingredient, Recipe, RecipeIngredient } from './types';
import { fromBase, matchIngredient, normaliseUnit, toBase } from './units';

export interface NewIngredientSpec {
  id: string;
  name: string;
  /** How it is measured: weight (g), volume (ml) or count (pieces). */
  measure: Dimension;
  aisle: string;
}

export type LineMatch =
  | { kind: 'have'; ingredientId: string }
  | { kind: 'new'; spec: NewIngredientSpec };

/** One ingredient line on the review screen, as Noor is editing it. */
export interface DraftLine {
  key: string;
  /** As the recipe wrote it, e.g. "boneless chicken". */
  name: string;
  /** What is typed in the amount box; parsed with parseAmountText. */
  amountText: string;
  /** Canonical unit, or '' for none. */
  unit: string;
  optional: boolean;
  /** false when Noor left the line out. */
  included: boolean;
  match: LineMatch | null;
  /** true when matched on its own (exact name or alias), false when Noor chose. */
  auto: boolean;
}

export interface LineProblem {
  code: 'unmatched' | 'amount' | 'unit';
  /** Short words for Noor, e.g. "Which of yours is this?" or "needs a unit". */
  message: string;
}

export type AmountParse = { ok: true; value: number | null } | { ok: false };

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** "2", "1.5", "1,5", "1/2", "1 1/2", "½": exact numbers only. Empty is "no amount yet" (null). */
export function parseAmountText(text: string): AmountParse {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return { ok: true, value: null };
  let value: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+) (\d+)\/(\d+)$/.exec(t))) value = Number(m[1]) + Number(m[2]) / Number(m[3]);
  else if ((m = /^(\d+)\/(\d+)$/.exec(t))) value = Number(m[1]) / Number(m[2]);
  else if ((m = /^(\d*) ?([½¼¾⅓⅔])$/u.exec(t))) value = Number(m[1] || 0) + FRACTIONS[m[2]];
  else if (/^(\d+([.,]\d+)?|[.,]\d+)$/.test(t)) value = Number(t.replace(',', '.'));
  else return { ok: false };
  return Number.isFinite(value) && value > 0 && value <= 100_000 ? { ok: true, value: Number(value.toPrecision(10)) } : { ok: false };
}

/** The unit as a canonical one, or '' when there is none or it is not recognised. */
const canonicalUnit = (unit: string | null | undefined): string => (unit ? normaliseUnit(unit) ?? '' : '');

/** Starting lines for a draft: exact matches are settled, everything else is flagged. */
export function draftLines(draft: RecipeDraft, ingredients: Ingredient[]): DraftLine[] {
  return draft.ingredients.map((line, i) => {
    const found = matchIngredient(line.name, ingredients);
    return {
      key: `l${i}`,
      name: line.name,
      amountText: line.amount === null ? '' : String(line.amount),
      unit: canonicalUnit(line.unit),
      optional: line.optional,
      included: true,
      match: found ? { kind: 'have', ingredientId: found.id } : null,
      auto: Boolean(found),
    };
  });
}

const words = (text: string) =>
  text.toLowerCase().replace(/[_\-–—/()]+/g, ' ').split(/\s+/).filter(w => w.length >= 2);

/** Her ingredients that may be what a line means (shares a word, spelling variants included), best first. */
export function suggestIngredients(name: string, ingredients: Ingredient[], limit = 3): Ingredient[] {
  const wanted = words(name).map(normalizeDishName).filter(Boolean);
  if (wanted.length === 0) return [];
  return ingredients
    .map(ing => {
      const have = new Set([ing.name, ing.id, ...ing.aliases].flatMap(words).map(normalizeDishName));
      const hits = wanted.filter(w => have.has(w)).length;
      const own = words(ing.name).length || 1;
      return { ing, hits, share: hits / own };
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.share - a.share || a.ing.name.localeCompare(b.ing.name))
    .slice(0, limit)
    .map(x => x.ing);
}

/** The picker's list: names, ids or aliases containing what Noor typed, names starting with it first. */
export function searchIngredients(text: string, ingredients: Ingredient[], limit = 8): Ingredient[] {
  const q = text.trim().toLowerCase();
  if (!q) return [...ingredients].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const key = normalizeDishName(q);
  return ingredients
    .map(ing => {
      const labels = [ing.name, ing.id.replace(/_/g, ' '), ...ing.aliases].map(l => l.toLowerCase());
      const starts = labels.some(l => l.startsWith(q) || l.split(' ').some(w => w.startsWith(q)));
      const contains = labels.some(l => l.includes(q));
      const sounds = Boolean(key) && labels.some(l => words(l).some(w => normalizeDishName(w) === key));
      return { ing, rank: starts ? 0 : contains ? 1 : sounds ? 2 : 3 };
    })
    .filter(x => x.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.ing.name.localeCompare(b.ing.name))
    .slice(0, limit)
    .map(x => x.ing);
}

/** An id like "Cracked_Wheat" that is not in `taken`. */
export function newIngredientId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name.normalize('NFD').replace(/\p{M}+/gu, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('_') || 'Ingredient';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  return id;
}

const HOUSEHOLD_COUNT_UNITS = ['bunch', 'clove', 'sprig', 'inch', 'packet'];

/** The ingredient a "New ingredient" choice creates. Volume ingredients know tsp, tbsp and cup. */
export function makeNewIngredient(spec: NewIngredientSpec, unit: string): Ingredient {
  const canonical = canonicalUnit(unit);
  const base: Ingredient = {
    id: spec.id, name: spec.name, aliases: [], dimension: spec.measure, aisle: spec.aisle,
    displayUnit: spec.measure === 'mass' ? 'g' : spec.measure === 'volume' ? 'ml' : 'pc',
  };
  if (spec.measure === 'volume') return { ...base, conversions: { tsp: 5, tbsp: 15, cup: 240 } };
  if (spec.measure === 'count' && HOUSEHOLD_COUNT_UNITS.includes(canonical)) {
    return { ...base, displayUnit: canonical, conversions: { [canonical]: 1 } };
  }
  return base;
}

/** What is wrong with a line, or null when it can be saved as it is. Lines left out never have problems. */
export function lineProblem(line: DraftLine, byId: Map<string, Ingredient>): LineProblem | null {
  if (!line.included) return null;
  const ingredient = line.match ? byId.get(line.match.kind === 'have' ? line.match.ingredientId : line.match.spec.id) : undefined;
  if (!line.match || !ingredient) return { code: 'unmatched', message: 'Which of yours is this?' };
  const amount = parseAmountText(line.amountText);
  if (!amount.ok) return { code: 'amount', message: 'Amount must be a number above 0' };
  if (amount.value === null) return { code: 'amount', message: 'needs an amount' };
  const converted = toBase(amount.value, line.unit, ingredient);
  if (!converted.ok) return { code: 'unit', message: 'needs a unit' };
  return null;
}

export interface DishMeta {
  id: string;
  name: string;
  serves: number;
  time: string;
  steps: string[];
  aliases: string[];
  source: { url: string; name?: string; checkedOn: string };
  /** A video link the search confirmed; never a search link. */
  videoUrl: string | null;
}

export interface BuiltDish {
  /** The personal recipe, built only from lines without problems. */
  recipe: Recipe;
  /** Ingredients Noor chose to create that do not exist yet. */
  newIngredients: Ingredient[];
  /** Her ingredients plus the new ones, for stock checks. */
  ingredientsById: Map<string, Ingredient>;
  problems: Map<string, LineProblem>;
  /** Included lines still flagged: saving is blocked while above 0. */
  flagged: number;
}

export function newRecipeId(random: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(4))): string {
  return `U-${[...random()].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Recipe names Noor will recognise: the typed name first, then the found title when it differs. */
export function dishAliases(typed: string, found: string): string[] {
  const out: string[] = [];
  for (const raw of [typed, found]) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name && !out.some(o => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/** Turns the reviewed lines into a personal recipe (plus the ingredients it needs created). Pure: saves nothing. */
export function buildDish(lines: DraftLine[], ingredients: Ingredient[], meta: DishMeta): BuiltDish {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const newById = new Map<string, Ingredient>();
  for (const line of lines) {
    if (line.included && line.match?.kind === 'new' && !byId.has(line.match.spec.id) && !newById.has(line.match.spec.id)) {
      newById.set(line.match.spec.id, makeNewIngredient(line.match.spec, line.unit));
    }
  }
  const all = new Map([...byId, ...newById]);

  const problems = new Map<string, LineProblem>();
  const merged = new Map<string, RecipeIngredient>();
  for (const line of lines) {
    const problem = lineProblem(line, all);
    if (problem) { problems.set(line.key, problem); continue; }
    if (!line.included || !line.match) continue;
    const id = line.match.kind === 'have' ? line.match.ingredientId : line.match.spec.id;
    const ingredient = all.get(id)!;
    const amount = (parseAmountText(line.amountText) as { ok: true; value: number }).value;
    const unit = canonicalUnit(line.unit);
    const found = merged.get(id);
    if (!found) {
      merged.set(id, { ingredientId: id, amount, unit, ...(line.optional ? { optional: true } : {}) });
      continue;
    }
    // The same ingredient twice (e.g. "onion" and "fried onion" both picked as Onion): one line.
    const a = toBase(found.amount, found.unit, ingredient);
    const b = toBase(amount, unit, ingredient);
    if (a.ok && b.ok) {
      const total = fromBase(a.value + b.value, ingredient);
      merged.set(id, { ingredientId: id, amount: total.amount, unit: total.unit, ...(found.optional && line.optional ? { optional: true } : {}) });
    }
  }

  const aliases = meta.aliases.filter(a => a.toLowerCase() !== meta.name.trim().toLowerCase());
  const recipe: Recipe = {
    id: meta.id,
    name: meta.name.trim() || 'New dish',
    serves: Math.min(30, Math.max(1, Math.round(meta.serves))),
    time: meta.time || 'Time not given',
    notes: `Found online${meta.source.name ? ` at ${meta.source.name}` : ''}. Checked ${meta.source.checkedOn}.`,
    category: 'My recipes',
    meals: ['lunch', 'dinner'],
    writtenUrl: meta.source.url,
    ...(meta.videoUrl ? { videoUrl: meta.videoUrl } : {}),
    ingredients: [...merged.values()],
    steps: meta.steps,
    aliases,
    source: { url: meta.source.url, ...(meta.source.name ? { name: meta.source.name } : {}), checkedOn: meta.source.checkedOn },
    version: 1,
    personal: true,
  };
  return { recipe, newIngredients: [...newById.values()], ingredientsById: all, problems, flagged: problems.size };
}

export interface StockSummary {
  /** Required ingredients (optional ones are not counted). */
  total: number;
  /** Of those, how many are in stock in full. */
  have: number;
  /** Short for the chosen servings, and by how much (base units). */
  short: { ingredientId: string; amount: number }[];
  /** Stock is "not sure": check the shelf. */
  unsure: string[];
}

/** "You have 9 of 12" and which ones are missing. */
export function stockSummary(a: Availability): StockSummary {
  const required = a.needs.filter(n => !n.optional);
  return {
    total: required.length,
    have: required.filter(n => n.status === 'enough').length,
    short: required.filter(n => n.status === 'short').map(n => ({ ingredientId: n.ingredientId, amount: n.short ?? 0 })),
    unsure: required.filter(n => n.status === 'maybe' || n.status === 'unconvertible').map(n => n.ingredientId),
  };
}
