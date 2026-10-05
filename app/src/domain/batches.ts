// Batches, places and dates on ingredients (F66, F67, F76). Stock totals always come from the
// event log; a batch only says where something is and when to use it by. Oldest expiry is
// consumed first, so what the ledger says remains is assumed to sit in the NEWEST batches.
import type { Balance } from './ledger';
import { addDaysTo } from './leftovers';
import type { Batch, Ingredient, StorageLocation } from './types';
import { toBase } from './units';

export const LOCATIONS: { id: StorageLocation; label: string }[] = [
  { id: 'fridge', label: 'Fridge' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'shelf', label: 'Shelf' },
];
export const locationLabel = (l: StorageLocation): string =>
  l === 'counter' ? 'Counter' : (LOCATIONS.find(x => x.id === l)?.label ?? l);

export const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type BatchState = 'in-stock' | 'partly' | 'may-be-used-up' | 'check';
export interface BatchStatus {
  batch: Batch;
  state: BatchState;
  /** Base units the ledger puts in this batch; null when stock is unknown. */
  remaining: number | null;
}

/** The order batches are used in: soonest expiry first, no date last, then older purchase. */
export function useOrder(batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) =>
    (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31')
    || (a.boughtOn ?? '').localeCompare(b.boughtOn ?? '')
    || a.id.localeCompare(b.id));
}

/**
 * Splits one ingredient's remaining stock over its batches, newest first (backwards through
 * the use order). Unknown stock, or stock marked "check", gives state 'check' for every batch.
 */
export function allocateBatches(batches: Batch[], balance: Balance | undefined): BatchStatus[] {
  const ordered = useOrder(batches);
  if (balance && (balance.amount === null || balance.needsCheck)) {
    return ordered.map(batch => ({ batch, state: 'check' as const, remaining: null }));
  }
  let left = balance?.amount ?? 0;
  const out: BatchStatus[] = [];
  for (const batch of [...ordered].reverse()) {
    const share = Math.min(batch.amount, Math.max(0, left));
    left -= share;
    const state: BatchState = share <= 0 ? 'may-be-used-up' : share < batch.amount ? 'partly' : 'in-stock';
    out.push({ batch, state, remaining: share });
  }
  return out.reverse();
}

/** Status for every batch, by batch id. */
export function batchStatuses(batches: Batch[], stock: Map<string, Balance>): Map<string, BatchStatus> {
  const byIngredient = new Map<string, Batch[]>();
  for (const b of batches) byIngredient.set(b.ingredientId, [...(byIngredient.get(b.ingredientId) ?? []), b]);
  const result = new Map<string, BatchStatus>();
  for (const [id, list] of byIngredient) for (const s of allocateBatches(list, stock.get(id))) result.set(s.batch.id, s);
  return result;
}

/** Places to show next to an ingredient's amount: where batches that may still exist are kept. */
export function placesFor(ingredientId: string, batches: Batch[], statuses: Map<string, BatchStatus>): string[] {
  const seen: string[] = [];
  for (const b of useOrder(batches.filter(x => x.ingredientId === ingredientId))) {
    if (statuses.get(b.id)?.state === 'may-be-used-up') continue;
    const label = locationLabel(b.location);
    if (!seen.includes(label)) seen.push(label);
  }
  return seen;
}

export interface UseSoonBatch { status: BatchStatus; expiresOn: string; daysLeft: number }

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** Batches expiring within `days` days (or already past), most urgent first; likely used-up ones last. */
export function batchesUseSoon(batches: Batch[], stock: Map<string, Balance>, today: string, days = 3): UseSoonBatch[] {
  const last = addDaysTo(today, days);
  const statuses = batchStatuses(batches, stock);
  return batches
    .filter(b => isDate(b.expiresOn) && b.expiresOn <= last)
    .map(b => ({ status: statuses.get(b.id)!, expiresOn: b.expiresOn!, daysLeft: dayNumber(b.expiresOn!) - dayNumber(today) }))
    .sort((a, b) =>
      Number(a.status.state === 'may-be-used-up') - Number(b.status.state === 'may-be-used-up')
      || a.expiresOn.localeCompare(b.expiresOn) || a.status.batch.id.localeCompare(b.status.batch.id));
}

export interface BatchInput {
  id: string;
  ingredient: Ingredient;
  amount: number | null;
  unit: string;
  location: StorageLocation;
  boughtOn?: string;
  expiresOn?: string;
  frozenOn?: string;
  packageAmount?: number | null;
  packageUnit?: string;
  fromEventId?: string;
  note?: string;
}
export type BatchResult = { ok: true; batch: Batch } | { ok: false; message: string };

/** Builds a batch from what was typed, refusing amounts and dates that cannot be used. */
export function buildBatch(i: BatchInput): BatchResult {
  if (i.amount === null || !Number.isFinite(i.amount) || i.amount <= 0) return { ok: false, message: 'Enter an amount above zero.' };
  const base = toBase(i.amount, i.unit, i.ingredient);
  if (!base.ok) return { ok: false, message: base.reason };
  for (const [label, d] of [['expiry', i.expiresOn], ['frozen', i.frozenOn], ['bought', i.boughtOn]] as const) {
    if (d !== undefined && d !== '' && !isDate(d)) return { ok: false, message: `The ${label} date is not a date.` };
  }
  let packageSize: Batch['packageSize'];
  if (i.packageAmount !== undefined && i.packageAmount !== null) {
    if (!Number.isFinite(i.packageAmount) || i.packageAmount <= 0) return { ok: false, message: 'Package size must be above zero.' };
    const p = toBase(i.packageAmount, i.packageUnit ?? '', i.ingredient);
    if (!p.ok) return { ok: false, message: p.reason };
    packageSize = { amount: i.packageAmount, unit: i.packageUnit! };
  }
  return {
    ok: true,
    batch: {
      id: i.id, ingredientId: i.ingredient.id, amount: Math.round(base.value * 1000) / 1000, location: i.location,
      ...(i.boughtOn ? { boughtOn: i.boughtOn } : {}),
      ...(i.expiresOn ? { expiresOn: i.expiresOn } : {}),
      ...(i.location === 'freezer' && i.frozenOn ? { frozenOn: i.frozenOn } : {}),
      ...(packageSize ? { packageSize } : {}),
      ...(i.fromEventId ? { fromEventId: i.fromEventId } : {}),
      ...(i.note ? { note: i.note } : {}),
    },
  };
}

/** The id of the batch made with a purchase: derived, so saving the purchase twice never doubles it. */
export const batchIdForPurchase = (eventId: string): string => `batch-${eventId}`;

/** Replaces the item with the same id, or adds it: a retry never duplicates. */
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [...list, item];
}
