// The kitchen event log (docs/PLAN.md section 3; fixes v3 defects D3, D4 and D5).
// v3 kept only pantry snapshots, so undoing a meal restored stock but left the meal in the
// cooking log and monthly totals (D3), and undoing a purchase left an "in pantry" tick on
// an empty item (D4). Here nothing is stored except events: balances, "in pantry", history
// and monthly totals are all calculated from the events that are still in effect, so one
// reversal removes every effect of the event it undoes.
import { householdDate, householdTime, HOUSEHOLD_TIME_ZONE } from '../lib/localDate';
import type {
  EventKind,
  KitchenEvent,
  MealRecord,
  MealSlot,
  Movement,
  QuantityBasis,
} from './types';

export interface Balance {
  /** Base units; null when Noor said she is not sure. */
  amount: number | null;
  basis: QuantityBasis;
  /** Local date of the last event that touched this ingredient. */
  lastChanged: string;
}

const BASIS_RANK: Record<QuantityBasis, number> = { measured: 0, estimate: 1, unknown: 2 };
const weaker = (a: QuantityBasis, b: QuantityBasis): QuantityBasis =>
  BASIS_RANK[a] >= BASIS_RANK[b] ? a : b;

const byTime = (a: KitchenEvent, b: KitchenEvent) =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

/** Builds an event stamped with the household-local date and time of `instant`. */
export function makeEvent(
  kind: EventKind,
  movements: Movement[],
  instant: Date,
  extra: Partial<Pick<KitchenEvent, 'meal' | 'reverses' | 'source' | 'note' | 'priceRs' | 'id'>> = {},
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): KitchenEvent {
  return {
    id: extra.id ?? newEventId(),
    kind,
    at: instant.toISOString(),
    localDate: householdDate(instant, timeZone),
    localTime: householdTime(instant, timeZone),
    timeZone,
    movements,
    ...(extra.meal ? { meal: extra.meal } : {}),
    ...(extra.reverses ? { reverses: extra.reverses } : {}),
    ...(extra.source ? { source: extra.source } : {}),
    ...(extra.note ? { note: extra.note } : {}),
    ...(extra.priceRs != null ? { priceRs: extra.priceRs } : {}),
  };
}

/**
 * Ids of events that are in effect. An event is undone while a reversal of it is in
 * effect; a reversal can itself be reversed ("redo"), which puts the original back.
 */
export function effectiveIds(events: KitchenEvent[]): Set<string> {
  const byId = new Map(events.map(e => [e.id, e]));
  const reversalsOf = new Map<string, KitchenEvent[]>();
  for (const e of events) {
    if (e.kind === 'reversal' && e.reverses) {
      reversalsOf.set(e.reverses, [...(reversalsOf.get(e.reverses) ?? []), e]);
    }
  }
  const memo = new Map<string, boolean>();
  const inEffect = (id: string, depth = 0): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (depth > events.length) return true; // malformed cycle: fail open, never loop
    const undone = (reversalsOf.get(id) ?? []).some(r => inEffect(r.id, depth + 1));
    memo.set(id, !undone);
    return !undone;
  };
  const result = new Set<string>();
  for (const id of byId.keys()) if (inEffect(id)) result.add(id);
  return result;
}

/** Events that change stock or history: in effect and not reversals themselves. */
export function activeEvents(events: KitchenEvent[]): KitchenEvent[] {
  const live = effectiveIds(events);
  return events.filter(e => e.kind !== 'reversal' && live.has(e.id)).sort(byTime);
}

/** Current stock per ingredient, from the events in effect. */
export function balances(events: KitchenEvent[]): Map<string, Balance> {
  const result = new Map<string, Balance>();
  for (const e of activeEvents(events)) {
    for (const m of e.movements) {
      const prev = result.get(m.ingredientId);
      let next: Balance;
      if (e.kind === 'set-stock' && m.setTo !== undefined) {
        next = { amount: m.setTo, basis: m.setTo === null ? 'unknown' : m.basis, lastChanged: e.localDate };
      } else if (!prev) {
        next = { amount: m.delta, basis: m.basis, lastChanged: e.localDate };
      } else {
        next = {
          amount: prev.amount === null ? null : prev.amount + m.delta,
          basis: weaker(prev.basis, m.basis),
          lastChanged: e.localDate,
        };
      }
      if (next.amount !== null) next.amount = Math.max(0, Math.round(next.amount * 1000) / 1000);
      result.set(m.ingredientId, next);
    }
  }
  return result;
}

/** "In the pantry" is never stored; it is read off the balance (D4). */
export function inPantry(balance: Balance | undefined): 'yes' | 'no' | 'maybe' {
  if (!balance) return 'no';
  if (balance.amount === null) return 'maybe';
  return balance.amount > 0 ? 'yes' : 'no';
}

/** Builds the event that undoes `target` and all of its effects. */
export function reverse(target: KitchenEvent, events: KitchenEvent[], instant: Date, note?: string): KitchenEvent {
  if (!events.some(e => e.id === target.id)) throw new Error('That entry is not in the log.');
  if (!effectiveIds(events).has(target.id)) throw new Error('That entry has already been undone.');
  return makeEvent('reversal', [], instant, { reverses: target.id, note }, target.timeZone);
}

export interface CookedMeal {
  eventId: string;
  localDate: string;
  localTime: string;
  meal: MealRecord;
}

/** Cooking history, newest first, without undone meals (D3). */
export function cookingHistory(events: KitchenEvent[]): CookedMeal[] {
  return activeEvents(events)
    .filter(e => e.kind === 'cook' && e.meal)
    .map(e => ({ eventId: e.id, localDate: e.localDate, localTime: e.localTime, meal: e.meal! }))
    .reverse();
}

export interface MonthSummary {
  month: string;
  meals: number;
  servings: number;
  bySlot: Record<MealSlot, number>;
  byRecipe: { recipeId: string; count: number }[];
}

/** Totals for a household-local month, YYYY-MM (D5): local dates, not UTC. */
export function monthSummary(events: KitchenEvent[], month: string): MonthSummary {
  const meals = cookingHistory(events).filter(c => c.localDate.startsWith(month + '-'));
  const bySlot: Record<MealSlot, number> = { breakfast: 0, lunch: 0, chai: 0, dinner: 0 };
  const counts = new Map<string, number>();
  let servings = 0;
  for (const c of meals) {
    bySlot[c.meal.slot] += 1;
    servings += c.meal.servings;
    counts.set(c.meal.recipeId, (counts.get(c.meal.recipeId) ?? 0) + 1);
  }
  const byRecipe = [...counts.entries()]
    .map(([recipeId, count]) => ({ recipeId, count }))
    .sort((a, b) => b.count - a.count || a.recipeId.localeCompare(b.recipeId));
  return { month, meals: meals.length, servings, bySlot, byRecipe };
}

/** Local date each recipe was last cooked, for "not cooked in a while" (F79, F81). */
export function lastCooked(events: KitchenEvent[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const c of cookingHistory(events)) {
    if (!result.has(c.meal.recipeId)) result.set(c.meal.recipeId, c.localDate);
  }
  return result;
}
