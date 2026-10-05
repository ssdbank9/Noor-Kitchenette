// Pantry actions (F22, F23, F24, F56, F59, F62, F68): pure builders for the event each button
// in the Pantry sheet records. Amounts are converted with toBase and refused with a message
// when they cannot be (never guessed). "Not sure" is unknown, never zero.
import type { Balance } from './ledger';
import { makeEvent } from './ledger';
import type { Ingredient, KitchenEvent } from './types';
import { KNOWN_UNITS, toBase } from './units';

export type PantryActionKind = 'bought' | 'checked' | 'used' | 'finished' | 'threw';

export const ACTION_LABEL: Record<PantryActionKind, string> = {
  bought: 'Bought more',
  checked: "Checked what's left",
  used: 'Used some',
  finished: 'Finished',
  threw: 'Threw away',
};

export interface PantryActionInput {
  action: PantryActionKind;
  ingredient: Ingredient;
  /** Amount as entered; null means "Not sure" (only for 'checked'). Ignored for 'finished'. */
  amount?: number | null;
  unit?: string;
  instant: Date;
  /** Rupees, for 'bought' only. */
  priceRs?: number;
  /** Current balance, used only to record the difference a check found. */
  current?: Balance;
}

export type PantryActionResult =
  | { ok: true; event: KitchenEvent; toast: string }
  | { ok: false; message: string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildPantryEvent(input: PantryActionInput): PantryActionResult {
  const { action, ingredient: ing, instant } = input;
  const name = ing.name;
  const typed = { source: 'typed' as const };

  if (action === 'finished') {
    const was = input.current?.amount ?? 0;
    const event = makeEvent('set-stock', [{ ingredientId: ing.id, delta: -was, basis: 'measured', setTo: 0 }], instant, typed);
    return { ok: true, event, toast: `${name}: none left.` };
  }

  if (action === 'checked' && input.amount === null) {
    const event = makeEvent('set-stock', [{ ingredientId: ing.id, delta: 0, basis: 'unknown', setTo: null }], instant, typed);
    return { ok: true, event, toast: `${name}: marked not sure.` };
  }

  const amount = input.amount;
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return { ok: false, message: 'Enter an amount.' };
  if (amount < 0) return { ok: false, message: 'Amounts cannot be negative.' };
  if (amount === 0 && action !== 'checked') return { ok: false, message: 'Enter an amount above zero.' };
  const base = toBase(amount, input.unit ?? '', ing);
  if (!base.ok) return { ok: false, message: base.reason };
  const value = round3(base.value);
  const shown = `${amount} ${input.unit}`;

  if (action === 'checked') {
    const was = input.current?.amount ?? 0;
    const event = makeEvent('set-stock', [{ ingredientId: ing.id, delta: round3(value - was), basis: 'measured', setTo: value }], instant, typed);
    return { ok: true, event, toast: `${name}: ${shown} left.` };
  }
  if (action === 'bought') {
    if (input.priceRs !== undefined && (!Number.isFinite(input.priceRs) || input.priceRs < 0)) {
      return { ok: false, message: 'Price cannot be negative.' };
    }
    const event = makeEvent('purchase', [{ ingredientId: ing.id, delta: value, basis: 'measured' }], instant, {
      ...typed,
      ...(input.priceRs !== undefined ? { priceRs: input.priceRs } : {}),
    });
    return { ok: true, event, toast: `Added ${shown} of ${name}.` };
  }
  const kind = action === 'used' ? 'use' : 'waste';
  const event = makeEvent(kind, [{ ingredientId: ing.id, delta: -value, basis: 'measured' }], instant, typed);
  return { ok: true, event, toast: action === 'used' ? `Used ${shown} of ${name}.` : `Threw away ${shown} of ${name}.` };
}

/** Units the picker may offer for this ingredient: exactly those toBase accepts. */
export function unitsFor(ingredient: Ingredient): string[] {
  return KNOWN_UNITS.filter(u => toBase(1, u, ingredient).ok);
}

export interface QuickAmount { amount: number; unit: string }

/** Quick-amount chips suited to the ingredient's unit (e.g. 250 g, 500 g, 1 kg; 1, 6, 12 pc; 1 cup). */
export function quickAmounts(ingredient: Ingredient): QuickAmount[] {
  const base: QuickAmount[] =
    ingredient.dimension === 'mass' ? [{ amount: 250, unit: 'g' }, { amount: 500, unit: 'g' }, { amount: 1, unit: 'kg' }]
    : ingredient.dimension === 'volume' ? [{ amount: 250, unit: 'ml' }, { amount: 500, unit: 'ml' }, { amount: 1, unit: 'L' }]
    : [{ amount: 1, unit: 'pc' }, { amount: 6, unit: 'pc' }, { amount: 12, unit: 'pc' }];
  if (ingredient.conversions?.cup !== undefined) base.push({ amount: 1, unit: 'cup' });
  return base.filter(q => toBase(q.amount, q.unit, ingredient).ok);
}

/** Stepper increment for a unit. */
export function stepFor(unit: string): number {
  return unit === 'g' || unit === 'ml' ? 50 : unit === 'kg' || unit === 'L' || unit === 'cup' ? 0.5 : 1;
}

/** Parses typed exact-amount text: plain non-negative decimal only. */
export function parseAmountText(text: string): number | null {
  const t = text.trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
