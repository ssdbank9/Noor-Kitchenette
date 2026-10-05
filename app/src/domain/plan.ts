// Meal planning (F54, F55, F60, F71). Planning NEVER changes stock: a plan is only a list of
// intentions. Stock changes when a dish is cooked (a cook event) and nowhere else. Every
// function here is pure: it returns new meals and never mutates its input.
//
// Rules shared with the basket (basket.ts) so the two never disagree:
//  - a dish "still needs cooking" when it is a dish item, its meal is not cancelled, nobody
//    is eating out at that meal, and its cook event is not in effect (undoing a cook un-cooks it);
//  - eating-out and leftover items never add raw ingredients to anything.
import { addDays, effectiveIds, makeEvent, type Balance } from './ledger';
import { suggestNextMeals, suitsSlot, type ToBase } from './suggest';
import type { Ingredient, KitchenEvent, MealSlot, PlanItem, PlannedMeal, Recipe, Leftover } from './types';

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'chai', 'dinner'];
export const SLOT_NAMES: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', chai: 'Chai', dinner: 'Dinner' };

const slotRank = (s: MealSlot) => SLOT_ORDER.indexOf(s);
const EPS = 1e-9;

// ---------- Week helpers ----------

/** Seven consecutive household-local dates starting at `start` (YYYY-MM-DD). */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The meals on one date in slot order; with `slot`, only that slot's meal (or undefined). */
export function mealsFor(plan: PlannedMeal[], date: string): PlannedMeal[];
export function mealsFor(plan: PlannedMeal[], date: string, slot: MealSlot): PlannedMeal | undefined;
export function mealsFor(plan: PlannedMeal[], date: string, slot?: MealSlot): PlannedMeal[] | PlannedMeal | undefined {
  const day = plan.filter(m => m.localDate === date).sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.id.localeCompare(b.id));
  return slot ? day.find(m => m.slot === slot) : day;
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/** true while a slot's time (HH:MM) is not more than 90 minutes in the past. */
export function slotStillToday(slotTime: string, nowHHMM: string): boolean {
  const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return minutes(slotTime) + 90 > minutes(nowHHMM);
}

/** Free text from Noor as plain text: control characters removed, spaces tidied, capped. */
export function cleanLabel(raw: string, max = 60): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------- Meal edits (pure) ----------

export function newMeal(id: string, localDate: string, slot: MealSlot, servings: number): PlannedMeal {
  return { id, localDate, slot, servings: clampServings(servings), items: [], status: 'planned' };
}

/** The meal at date+slot, or a new empty one (the caller saves it once it has an item). */
export function mealOrNew(plan: PlannedMeal[], id: string, localDate: string, slot: MealSlot, servings: number): PlannedMeal {
  return mealsFor(plan, localDate, slot) ?? newMeal(id, localDate, slot, servings);
}

export const clampServings = (n: number) => Math.max(1, Math.min(30, Math.round(Number.isFinite(n) ? n : 1)));

const dishItem = (r: Pick<Recipe, 'id' | 'name'>): PlanItem => ({ kind: 'dish', recipeId: r.id, recipeName: r.name });

/** Adds a dish. The same dish is not added twice to one meal unless the first is already cooked. */
export function addDish(meal: PlannedMeal, recipe: Pick<Recipe, 'id' | 'name'>): PlannedMeal {
  if (meal.items.some(i => i.kind === 'dish' && i.recipeId === recipe.id && !i.cookedEventId)) return meal;
  return { ...meal, items: [...meal.items, dishItem(recipe)] };
}

/** Removes one item. */
export function removeItem(meal: PlannedMeal, index: number): PlannedMeal {
  if (index < 0 || index >= meal.items.length) return meal;
  return { ...meal, items: meal.items.filter((_, i) => i !== index) };
}

/** Replaces a dish that has not been cooked with another dish. A cooked dish is never swapped. */
export function swapDish(meal: PlannedMeal, index: number, recipe: Pick<Recipe, 'id' | 'name'>): PlannedMeal {
  const item = meal.items[index];
  if (!item || item.kind !== 'dish' || item.cookedEventId) return meal;
  return { ...meal, items: meal.items.map((it, i) => (i === index ? dishItem(recipe) : it)) };
}

export function setServings(meal: PlannedMeal, servings: number): PlannedMeal {
  return { ...meal, servings: clampServings(servings) };
}

export function cancelMeal(meal: PlannedMeal): PlannedMeal {
  return { ...meal, status: 'cancelled' };
}

export function restoreMeal(meal: PlannedMeal): PlannedMeal {
  return { ...meal, status: 'planned' };
}

/** Eating out replaces cooking at that meal; nothing is deducted. One eating-out item per meal. */
export function addEatOut(meal: PlannedMeal, label: string): PlannedMeal {
  const item: PlanItem = { kind: 'eatout', label: cleanLabel(label) };
  const others = meal.items.filter(i => i.kind !== 'eatout');
  return { ...meal, items: [...others, item] };
}

/** Planned eating of leftovers: portions are clamped to what is left. */
export function addLeftover(meal: PlannedMeal, leftover: Pick<Leftover, 'id' | 'name' | 'portionsLeft'>, portions: number): PlannedMeal {
  const p = Math.max(1, Math.min(Math.max(1, leftover.portionsLeft), Math.floor(portions)));
  const item: PlanItem = { kind: 'leftover', leftoverId: leftover.id, label: cleanLabel(leftover.name), portions: p };
  return { ...meal, items: [...meal.items, item] };
}

/** Marks a planned leftover item as eaten (the leftover itself is changed with applyLeftover). */
export function markLeftoverUsed(meal: PlannedMeal, index: number, localDate: string): PlannedMeal {
  const item = meal.items[index];
  if (!item || item.kind !== 'leftover') return meal;
  return { ...meal, items: meal.items.map((it, i) => (i === index ? { ...item, usedOn: localDate } : it)) };
}

/** Links a dish item to the cook event that made it. */
export function setCooked(meal: PlannedMeal, index: number, eventId: string): PlannedMeal {
  const item = meal.items[index];
  if (!item || item.kind !== 'dish') return meal;
  return { ...meal, items: meal.items.map((it, i) => (i === index ? { ...item, cookedEventId: eventId } : it)) };
}

// ---------- State of an item ----------

type Live = ReadonlySet<string> | KitchenEvent[];
const liveSet = (live: Live): ReadonlySet<string> => (Array.isArray(live) ? effectiveIds(live) : (live as ReadonlySet<string>));

/** A dish is cooked while its cook event is in effect: undoing the cook un-cooks it. */
export function isCooked(item: PlanItem, live: Live): boolean {
  return item.kind === 'dish' && !!item.cookedEventId && liveSet(live).has(item.cookedEventId);
}

/** Somebody is eating out at this meal, so no cooking is needed for it. */
export const isEatingOut = (meal: PlannedMeal): boolean => meal.items.some(i => i.kind === 'eatout');

/** The meal still expects cooking at home (not cancelled, not eating out). */
export const cooksAtHome = (meal: PlannedMeal): boolean => meal.status === 'planned' && !isEatingOut(meal);

// ---------- What the planned dishes need ----------

export interface PendingDish {
  meal: PlannedMeal;
  index: number;
  item: Extract<PlanItem, { kind: 'dish' }>;
  recipe: Recipe;
}

/** Uncooked dishes of meals still being cooked, dated today or later, in date and slot order. */
export function pendingDishes(plan: PlannedMeal[], recipesById: Map<string, Recipe>, today: string, live: Live): PendingDish[] {
  const set = liveSet(live);
  const out: PendingDish[] = [];
  const meals = plan
    .filter(m => m.localDate >= today && cooksAtHome(m))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : slotRank(a.slot) - slotRank(b.slot) || a.id.localeCompare(b.id)));
  for (const meal of meals) {
    meal.items.forEach((item, index) => {
      if (item.kind !== 'dish' || isCooked(item, set)) return;
      const recipe = recipesById.get(item.recipeId);
      if (recipe) out.push({ meal, index, item, recipe });
    });
  }
  return out;
}

export interface DishNeed {
  ingredientId: string;
  /** Base units for the meal's servings; null when the recipe's unit cannot be converted. */
  need: number | null;
}

/** What one planned dish needs, per ingredient (required items only), scaled to the meal's servings. */
export function dishNeeds(recipe: Recipe, servings: number, ingredientsById: Map<string, Ingredient>, toBase: ToBase): DishNeed[] {
  const scale = servings / recipe.serves;
  const out = new Map<string, number | null>();
  for (const ri of recipe.ingredients) {
    if (ri.optional) continue;
    const ing = ingredientsById.get(ri.ingredientId);
    const r = ing ? toBase(ri.amount * scale, ri.unit, ing) : null;
    const prev = out.get(ri.ingredientId);
    if (!r || !r.ok) out.set(ri.ingredientId, null);
    else out.set(ri.ingredientId, prev === null ? null : (prev ?? 0) + r.value);
  }
  return [...out].map(([ingredientId, need]) => ({ ingredientId, need }));
}

export interface CompetingMeal {
  mealId: string;
  localDate: string;
  slot: MealSlot;
  recipeName: string;
  need: number;
}

export interface Competition {
  ingredientId: string;
  /** Base units the planned meals need in total. */
  need: number;
  /** Base units in stock. */
  have: number;
  short: number;
  meals: CompetingMeal[];
}

/**
 * Where the plan asks for more of an ingredient than is in stock. Meals are taken in date
 * and slot order and their needs add up; an ingredient is reported when the running need
 * passes the stock. Stock that is "not sure" or flagged for checking is not judged here
 * (the basket shows it as "Check").
 */
export function competition(
  plan: PlannedMeal[],
  recipes: Recipe[],
  stock: Map<string, Balance>,
  ingredients: Ingredient[],
  toBase: ToBase,
  today: string,
  live: Live,
): Competition[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const running = new Map<string, { need: number; meals: CompetingMeal[] }>();
  for (const p of pendingDishes(plan, recipesById, today, live)) {
    for (const n of dishNeeds(p.recipe, p.meal.servings, byId, toBase)) {
      if (n.need === null || n.need <= 0) continue;
      const entry = running.get(n.ingredientId) ?? { need: 0, meals: [] };
      entry.need += n.need;
      entry.meals.push({ mealId: p.meal.id, localDate: p.meal.localDate, slot: p.meal.slot, recipeName: p.recipe.name, need: n.need });
      running.set(n.ingredientId, entry);
    }
  }
  const out: Competition[] = [];
  for (const ing of ingredients) {
    const entry = running.get(ing.id);
    if (!entry) continue;
    const b = stock.get(ing.id);
    if (b && (b.amount === null || b.needsCheck)) continue;
    const have = b ? (b.amount as number) : 0;
    if (entry.need - have > EPS) out.push({ ingredientId: ing.id, need: entry.need, have, short: entry.need - have, meals: entry.meals });
  }
  return out;
}

/** Warnings that involve a meal on the given date. */
export const competitionOnDate = (c: Competition[], date: string): Competition[] =>
  c.filter(x => x.meals.some(m => m.localDate === date));

// ---------- Today's card ----------

export type PlannedHero =
  | { kind: 'dish'; meal: PlannedMeal; dishes: { index: number; recipeId: string; recipeName: string }[] }
  | { kind: 'eatout'; meal: PlannedMeal; label: string };

/** What the plan says for one slot: dishes still to cook, or eating out; null when nothing applies. */
export function plannedHero(plan: PlannedMeal[], date: string, slot: MealSlot, live: Live): PlannedHero | null {
  const meal = mealsFor(plan, date, slot);
  if (!meal || meal.status !== 'planned') return null;
  const out = meal.items.find(i => i.kind === 'eatout');
  if (out && out.kind === 'eatout') return { kind: 'eatout', meal, label: out.label };
  const set = liveSet(live);
  const dishes: { index: number; recipeId: string; recipeName: string }[] = [];
  meal.items.forEach((item, index) => {
    if (item.kind === 'dish' && !isCooked(item, set)) dishes.push({ index, recipeId: item.recipeId, recipeName: item.recipeName });
  });
  return dishes.length ? { kind: 'dish', meal, dishes } : null;
}

// ---------- Suggest the rest of the week ----------

export interface Proposal {
  localDate: string;
  slot: MealSlot;
  recipeId: string;
  recipeName: string;
  servings: number;
  status: 'ready' | 'maybe' | 'missing';
  reasons: string[];
}

export interface SuggestWeekInput {
  plan: PlannedMeal[];
  recipes: Recipe[];
  events: KitchenEvent[];
  ingredients: Ingredient[];
  toBase: ToBase;
  today: string;
  servings: number;
  favourites?: Set<string>;
  days?: number;
  slots?: MealSlot[];
  /** Dishes Noor turned down for a slot: key `${date}|${slot}`. */
  exclude?: Map<string, Set<string>>;
}

const TIER = { ready: 0, maybe: 1, missing: 2 } as const;
/** No dish twice within this many days. */
export const VARIETY_DAYS = 3;

/**
 * Proposes dishes for empty lunch and dinner slots over the next days. Dishes that can be
 * made from what is left (after the planned meals and the earlier proposals) come first, no
 * dish repeats within 3 days, and dishes marked "Not again" never appear. NOTHING is saved:
 * the caller turns a proposal into a meal only when Noor taps Use this.
 */
export function suggestWeek(input: SuggestWeekInput): Proposal[] {
  const { plan, recipes, ingredients, toBase, today, servings } = input;
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const live = effectiveIds(input.events);
  const sim: KitchenEvent[] = [...input.events];
  let counter = 0;
  const consume = (recipe: Recipe, n: number, label: string) => {
    const movements = dishNeeds(recipe, n, byId, toBase)
      .filter(d => d.need !== null && d.need > 0)
      .map(d => ({ ingredientId: d.ingredientId, delta: -(d.need as number), basis: 'measured' as const }));
    if (!movements.length) return;
    // Far in the future so every simulated use is applied after the real entries.
    const at = new Date(Date.UTC(2999, 0, 1) + counter * 1000);
    sim.push(makeEvent('use', movements, at, { id: `plan-sim-${label}-${counter++}` }));
  };

  // Dishes already in the plan use stock and count for variety.
  const chosen: { recipeId: string; date: string }[] = [];
  for (const m of plan) {
    if (m.status !== 'planned') continue;
    for (const i of m.items) if (i.kind === 'dish') chosen.push({ recipeId: i.recipeId, date: m.localDate });
  }
  for (const p of pendingDishes(plan, recipesById, today, live)) consume(p.recipe, p.meal.servings, 'plan');

  const out: Proposal[] = [];
  const dates = Array.from({ length: input.days ?? 7 }, (_, i) => addDays(today, i));
  for (const date of dates) {
    for (const slot of input.slots ?? (['lunch', 'dinner'] as MealSlot[])) {
      const existing = mealsFor(plan, date, slot);
      if (existing && (existing.items.length > 0 || existing.status === 'cancelled')) continue;
      const skip = input.exclude?.get(`${date}|${slot}`);
      const ranked = suggestNextMeals(recipes, servings, sim, ingredients, toBase, date, input.favourites ?? new Set(), slot)
        .filter(s => suitsSlot(s.recipe, slot))
        .filter(s => !skip?.has(s.recipe.id))
        .filter(s => !chosen.some(c => c.recipeId === s.recipe.id && Math.abs(daysBetween(c.date, date)) < VARIETY_DAYS));
      const best = ranked
        .map((s, i) => ({ s, i }))
        .sort((a, b) => TIER[a.s.availability.status] - TIER[b.s.availability.status] || a.i - b.i)[0]?.s;
      if (!best) continue;
      out.push({
        localDate: date, slot, recipeId: best.recipe.id, recipeName: best.recipe.name, servings,
        status: best.availability.status, reasons: best.reasons,
      });
      chosen.push({ recipeId: best.recipe.id, date });
      consume(best.recipe, servings, 'proposal');
    }
  }
  return out;
}

/** The meal to save when Noor accepts a proposal: the dish added to the slot's meal (or a new one). */
export function applyProposal(plan: PlannedMeal[], p: Proposal, newId: string): PlannedMeal {
  const base = mealOrNew(plan, newId, p.localDate, p.slot, p.servings);
  return addDish({ ...base, status: 'planned' }, { id: p.recipeId, name: p.recipeName });
}
