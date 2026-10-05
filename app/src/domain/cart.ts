// The To-buy cart (D-22). It is DERIVED every time from four sources and never stored:
//  - the manual list (items Noor added, "+ List" from a dish),
//  - the plan basket (basketFromPlan, already stock-aware),
//  - AUTOMATIC low stock: every ingredient whose balance is below its minimum,
//  - nothing else. Dismissals (snooze / remove) only ever hide the automatic low-stock reason.
// One line per ingredient. When an ingredient is needed by the plan or the manual list AND is
// low, the line takes the LARGER need, never the sum (buying both would double count), and keeps
// every reason. An amount of null means "Check": stock not known, flagged for a check, or a
// recipe unit that cannot be converted. A quantity is never guessed.
import type { BasketLine } from './basket';
import type { Balance } from './ledger';
import type { ShoppingList } from './shopping';
import type { Dismissal, Ingredient, ShopPrefs, Store } from './types';

export interface CartReasons {
  /** Below the ingredient's minimum (automatic). */
  low?: true;
  /** Names of the planned dishes that need it. */
  plan?: string[];
  /** On the manual list. */
  manual?: true;
  /** An "always keep" item: it has a usual buy amount. */
  staple?: true;
}

export interface CartMeal { recipeName: string; localDate: string; slot: string }

export interface CartLine {
  ingredientId: string;
  /** Base units to buy; null means "Check". */
  amountBase: number | null;
  reasons: CartReasons;
  /** The planned meals behind reasons.plan, for "For Karahi Tue". */
  meals: CartMeal[];
  /** Recipe ids behind a manual line that came from "+ List" on a dish. */
  manualRecipeIds: string[];
  /** Usable stock in base units, null when not known. */
  stock: number | null;
}

export interface CartInput {
  manual: ShoppingList;
  basket: BasketLine[];
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  /** Household-local date, YYYY-MM-DD. */
  today: string;
  prefs: ShopPrefs;
}

const EPS = 1e-9;

/** Larger of two needs; a missing (check) amount never hides a known one. */
function larger(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Is the automatic low-stock reason hidden for this ingredient right now?
 * - snooze: hidden while today is before `until`.
 * - removed: hidden until stock is strictly below the amount it had when removed. When that
 *   amount was unknown, hidden until the stock is known again.
 */
export function lowIsHidden(d: Dismissal | undefined, today: string, current: number | null): boolean {
  if (!d) return false;
  if (d.kind === 'snooze') return d.until !== undefined && today < d.until;
  if (current === null) return true; // still not sure: she said "remove"
  if (d.atAmount === null || d.atAmount === undefined) return false;
  return !(current < d.atAmount - EPS);
}

export function cartLines(input: CartInput): CartLine[] {
  const { manual, basket, ingredients, stock, today, prefs } = input;
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const dismissals = new Map<string, Dismissal>();
  for (const d of prefs.dismissed) dismissals.set(d.ingredientId, d);

  type Draft = { amount: number | null; has: boolean; line: CartLine };
  const drafts = new Map<string, Draft>();
  const draftFor = (id: string): Draft => {
    let d = drafts.get(id);
    if (!d) {
      const b = stock.get(id);
      d = { amount: null, has: false, line: { ingredientId: id, amountBase: null, reasons: {}, meals: [], manualRecipeIds: [], stock: b ? b.amount : 0 } };
      drafts.set(id, d);
    }
    return d;
  };
  const addAmount = (d: Draft, amount: number | null) => {
    d.amount = d.has ? larger(d.amount, amount) : amount;
    d.has = true;
  };

  for (const m of manual) {
    if (!byId.has(m.ingredientId)) continue;
    const d = draftFor(m.ingredientId);
    d.line.reasons.manual = true;
    for (const r of m.recipeIds) if (!d.line.manualRecipeIds.includes(r)) d.line.manualRecipeIds.push(r);
    addAmount(d, m.amountBase);
  }

  for (const l of basket) {
    if (!byId.has(l.ingredientId) || !l.reasons.includes('planned')) continue;
    const d = draftFor(l.ingredientId);
    const names = [...new Set(l.meals.map(x => x.recipeName))];
    d.line.reasons.plan = [...new Set([...(d.line.reasons.plan ?? []), ...names])];
    for (const m of l.meals) {
      if (!d.line.meals.some(x => x.recipeName === m.recipeName && x.localDate === m.localDate && x.slot === m.slot)) {
        d.line.meals.push({ recipeName: m.recipeName, localDate: m.localDate, slot: m.slot });
      }
    }
    addAmount(d, l.amountBase);
  }

  // A pantry with nothing recorded at all has not been set up yet: everything would look "low",
  // which is noise, not news. Low stock starts once there is any stock on record.
  for (const ing of stock.size === 0 ? [] : ingredients) {
    if (ing.minStock === undefined) continue;
    const b = stock.get(ing.id);
    let need: number | null;
    let current: number | null;
    if (b && (b.amount === null || b.needsCheck)) {
      need = null; // not sure: a "Check" line, never a guess
      current = b.amount === null ? null : b.amount;
      if (b.needsCheck) current = null;
    } else {
      const have = b ? (b.amount as number) : 0;
      if (!(ing.minStock - have > EPS)) continue;
      need = Math.max(ing.buyAmount ?? 0, ing.minStock - have);
      current = have;
    }
    if (lowIsHidden(dismissals.get(ing.id), today, current)) continue;
    const d = draftFor(ing.id);
    d.line.reasons.low = true;
    if (ing.buyAmount !== undefined) d.line.reasons.staple = true;
    addAmount(d, need);
  }

  const lines = [...drafts.values()].map(d => ({ ...d.line, amountBase: d.amount }));
  return lines.sort((a, b) => {
    const x = byId.get(a.ingredientId)!;
    const y = byId.get(b.ingredientId)!;
    return x.aisle.localeCompare(y.aisle) || x.name.localeCompare(y.name) || x.id.localeCompare(y.id);
  });
}

// ---------- Grouping, store names and sharing ----------

export const ANY_STORE = 'Any store';

export interface CartGroup {
  key: string;
  label: string;
  lines: CartLine[];
}

export type CartGrouping = 'aisle' | 'store';

/** The store Noor prefers for an ingredient, or undefined ("Any store"). */
export function preferredStore(prefs: ShopPrefs, ingredientId: string): Store | undefined {
  const id = prefs.preferred[ingredientId];
  return id ? prefs.stores.find(s => s.id === id) : undefined;
}

/** Lines are already sorted by aisle then name; groups keep that order. Store groups follow the store list, "Any store" last. */
export function groupCart(lines: CartLine[], ingredients: Ingredient[], by: CartGrouping, prefs: ShopPrefs): CartGroup[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const groups = new Map<string, CartGroup>();
  const put = (key: string, label: string, line: CartLine) => {
    const g = groups.get(key) ?? { key, label, lines: [] };
    g.lines.push(line);
    groups.set(key, g);
  };
  for (const l of lines) {
    if (by === 'aisle') {
      const aisle = byId.get(l.ingredientId)?.aisle ?? 'Other';
      put(aisle, aisle, l);
    } else {
      const s = preferredStore(prefs, l.ingredientId);
      put(s ? s.id : '', s ? s.name : ANY_STORE, l);
    }
  }
  const all = [...groups.values()];
  if (by === 'aisle') return all;
  const order = new Map(prefs.stores.map((s, i) => [s.id, i]));
  return all.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)));
}

/** Plain text for sharing the whole cart, by aisle or by store. Empty string when the cart is empty. */
export function cartShareText(
  lines: CartLine[],
  ingredients: Ingredient[],
  by: CartGrouping,
  prefs: ShopPrefs,
  format: (base: number, ing: Ingredient) => string,
): string {
  if (lines.length === 0) return '';
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const out = ['Shopping list'];
  for (const g of groupCart(lines, ingredients, by, prefs)) {
    out.push('', g.label);
    for (const l of g.lines) {
      const ing = byId.get(l.ingredientId);
      const name = ing?.name ?? l.ingredientId;
      out.push(`- ${name}${l.amountBase === null || !ing ? ' (check)' : ` ${format(l.amountBase, ing)}`}`);
    }
  }
  return out.join('\n');
}

// ---------- Dismissals ----------

const without = (list: Dismissal[], ingredientId: string) => list.filter(d => d.ingredientId !== ingredientId);

/** "Not this week": hides the low-stock reason for `days` days (default 7). */
export function snoozed(prefs: ShopPrefs, ingredientId: string, today: string, days = 7): ShopPrefs {
  const [y, m, d] = today.split('-').map(Number);
  const until = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return { ...prefs, dismissed: [...without(prefs.dismissed, ingredientId), { ingredientId, kind: 'snooze', until }] };
}

/** "Remove": hides the low-stock reason until stock is lower than it is now. */
export function removed(prefs: ShopPrefs, ingredientId: string, stockNow: number | null): ShopPrefs {
  return { ...prefs, dismissed: [...without(prefs.dismissed, ingredientId), { ingredientId, kind: 'removed', atAmount: stockNow }] };
}

/** A purchase starts afresh: what was bought no longer carries an old "not this week" or "remove". */
export function clearDismissals(prefs: ShopPrefs, ingredientIds: Iterable<string>): ShopPrefs {
  const ids = new Set(ingredientIds);
  if (!prefs.dismissed.some(d => ids.has(d.ingredientId))) return prefs;
  return { ...prefs, dismissed: prefs.dismissed.filter(d => !ids.has(d.ingredientId)) };
}

// ---------- Manual items ----------

/** Adds a hand-typed item. An item already on the list keeps ONE line with the larger amount. */
export function addManualItem(list: ShoppingList, ingredientId: string, amountBase: number): ShoppingList {
  const found = list.find(i => i.ingredientId === ingredientId);
  if (!found) return [...list, { ingredientId, amountBase, reason: 'dish', recipeIds: [] }];
  return list.map(i => (i.ingredientId === ingredientId ? { ...i, amountBase: larger(i.amountBase, amountBase) } : i));
}
