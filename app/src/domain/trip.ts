// Shopping trip mode (D-22). A trip is plain saved state (ShopPrefs.trip): what has been picked
// up so far, in base units. Nothing touches the pantry until "Done shopping", which makes ONE
// purchase event whose id comes from the trip id, so a retry or a double tap replaces it and
// can never double the stock.
import { clearDismissals, type CartLine } from './cart';
import { makeEvent } from './ledger';
import type { ShoppingList } from './shopping';
import type { Ingredient, KitchenEvent, ShopPrefs, Trip } from './types';
import { toBase } from './units';

const EPS = 1e-9;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The id of the one purchase event a trip creates. */
export const tripEventId = (trip: Pick<Trip, 'id'>): string => `trip-${trip.id}`;

/** Starts a trip. Starting while one is going on keeps that one (a double tap changes nothing). */
export function startTrip(prefs: ShopPrefs, now: Date, id: string = globalThis.crypto.randomUUID()): ShopPrefs {
  if (prefs.trip) return prefs;
  return { ...prefs, trip: { id, startedAt: now.toISOString(), got: {} } };
}

/** Records how much of an ingredient is in the trolley (base units). Zero or less clears it. */
export function setGot(trip: Trip, ingredientId: string, amountBase: number): Trip {
  const got = { ...trip.got };
  const value = round3(amountBase);
  if (value > EPS) got[ingredientId] = value;
  else delete got[ingredientId];
  return { ...trip, got };
}

/**
 * Taps a line: picked up whole, or put back if it already was. A "Check" line has no amount
 * to take, so it is recorded as one usual buy (the buy amount, else one of its display unit)
 * and the stepper corrects it; nothing is guessed silently.
 */
export function toggleLine(trip: Trip, line: CartLine, ingredient: Ingredient): Trip {
  if ((trip.got[line.ingredientId] ?? 0) > EPS) return setGot(trip, line.ingredientId, 0);
  return setGot(trip, line.ingredientId, wholeAmount(line, ingredient));
}

/** What tapping a line picks up: the whole amount, or for a Check line one usual buy. */
export function wholeAmount(line: CartLine, ingredient: Ingredient): number {
  if (line.amountBase !== null) return line.amountBase;
  if (ingredient.buyAmount !== undefined) return ingredient.buyAmount;
  const one = toBase(1, ingredient.displayUnit, ingredient);
  return one.ok ? one.value : 1;
}

export const isPicked = (trip: Trip, ingredientId: string): boolean => (trip.got[ingredientId] ?? 0) > EPS;

/** A line is done when everything it asks for is picked (a Check line, when anything is). */
export function isComplete(trip: Trip, line: CartLine): boolean {
  const got = trip.got[line.ingredientId] ?? 0;
  if (got <= EPS) return false;
  return line.amountBase === null || got >= line.amountBase - EPS;
}

/** "7 of 12": lines fully picked, out of all lines in the cart. */
export function tripProgress(trip: Trip, lines: CartLine[]): { done: number; total: number; anyPicked: boolean } {
  return {
    done: lines.filter(l => isComplete(trip, l)).length,
    total: lines.length,
    anyPicked: Object.values(trip.got).some(v => v > EPS),
  };
}

/**
 * The manual list after buying: a line bought in full leaves the list, one bought in part keeps
 * the rest, and a "Check" line (no amount) leaves once anything of it is bought.
 */
export function takeFromList(list: ShoppingList, bought: Record<string, number>): ShoppingList {
  const out: ShoppingList = [];
  for (const item of list) {
    const g = bought[item.ingredientId] ?? 0;
    if (g <= EPS) out.push(item);
    else if (item.amountBase !== null && g < item.amountBase - EPS) out.push({ ...item, amountBase: round3(item.amountBase - g) });
  }
  return out;
}

export type TripFinish =
  | { ok: false; message: string }
  | { ok: true; event: KitchenEvent; prefs: ShopPrefs; list: ShoppingList; pickedIds: string[] };

/**
 * Finishes the trip: the ONE purchase event (id `trip-<trip id>`, one movement per picked-up
 * ingredient), the prefs with the trip cleared, and the manual list without what was picked.
 * A manual line picked in full leaves the list; picked in part, it keeps the rest.
 * `priceRs` is the optional total Noor typed.
 */
export function finishTrip(
  prefs: ShopPrefs,
  list: ShoppingList,
  now: Date,
  timeZone: string,
  priceRs?: number,
): TripFinish {
  const trip = prefs.trip;
  if (!trip) return { ok: false, message: 'There is no shopping trip going on.' };
  const picked = Object.entries(trip.got).filter(([, v]) => v > EPS);
  if (picked.length === 0) return { ok: false, message: 'Pick up at least one item first.' };
  if (priceRs !== undefined && (!Number.isFinite(priceRs) || priceRs < 0)) return { ok: false, message: 'Total spent must be a number, like 4500.' };

  const event = makeEvent(
    'purchase',
    picked.map(([ingredientId, delta]) => ({ ingredientId, delta, basis: 'measured' as const })),
    now,
    { id: tripEventId(trip), source: 'typed', ...(priceRs !== undefined ? { priceRs } : {}) },
    timeZone,
  );

  const nextList = takeFromList(list, trip.got);
  const { trip: _gone, ...rest } = prefs;
  const pickedIds = picked.map(([id]) => id);
  // What was bought starts afresh: an old "not this week" or "remove" no longer applies.
  return { ok: true, event, prefs: clearDismissals(rest, pickedIds), list: nextList, pickedIds };
}

/** Cancels the trip: nothing was bought, so the pantry and the manual list stay as they are. */
export function cancelTrip(prefs: ShopPrefs): ShopPrefs {
  const { trip: _gone, ...rest } = prefs;
  return rest;
}
