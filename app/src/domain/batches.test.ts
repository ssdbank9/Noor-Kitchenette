import { describe, expect, it } from 'vitest';
import { allocateBatches, batchesUseSoon, buildBatch, placesFor, batchStatuses, upsertById } from './batches';
import { balances, makeEvent } from './ledger';
import type { Batch, Ingredient } from './types';

const milk: Ingredient = { id: 'Milk', name: 'Milk', aliases: [], dimension: 'volume', displayUnit: 'L', aisle: 'Dairy' };
const b = (id: string, amount: number, expiresOn?: string, extra: Partial<Batch> = {}): Batch =>
  ({ id, ingredientId: 'Milk', amount, location: 'fridge', ...(expiresOn ? { expiresOn } : {}), ...extra });
const stockOf = (ml: number) => balances([makeEvent('set-stock', [{ ingredientId: 'Milk', delta: ml, basis: 'measured', setTo: ml }], new Date('2026-10-01T10:00:00Z'))]).get('Milk');
const unknownStock = () => balances([makeEvent('set-stock', [{ ingredientId: 'Milk', delta: 0, basis: 'unknown', setTo: null }], new Date('2026-10-01T10:00:00Z'))]);

describe('batch allocation (oldest expiry is used first)', () => {
  const list = [b('new', 1000, '2026-10-20'), b('old', 1000, '2026-10-06'), b('mid', 1000, '2026-10-10')];

  it('puts remaining stock in the newest batches and flags older ones that may be used up', () => {
    const out = allocateBatches(list, stockOf(1500));
    expect(out.map(s => [s.batch.id, s.state, s.remaining])).toEqual([
      ['old', 'may-be-used-up', 0], ['mid', 'partly', 500], ['new', 'in-stock', 1000],
    ]);
  });
  it('keeps every batch in stock when stock covers them all', () => {
    expect(allocateBatches(list, stockOf(5000)).every(s => s.state === 'in-stock')).toBe(true);
  });
  it('flags all batches when nothing is left or nothing was ever recorded', () => {
    expect(allocateBatches(list, stockOf(0)).every(s => s.state === 'may-be-used-up')).toBe(true);
    expect(allocateBatches(list, undefined).every(s => s.state === 'may-be-used-up')).toBe(true);
  });
  it('batches without a date are used last, so they are assumed to remain', () => {
    const out = allocateBatches([b('dated', 1000, '2026-10-06'), b('none', 1000)], stockOf(1000));
    expect(out.map(s => [s.batch.id, s.state])).toEqual([['dated', 'may-be-used-up'], ['none', 'in-stock']]);
  });
  it('unknown or needs-check stock is "check", never used-up', () => {
    const unknown = unknownStock().get('Milk');
    expect(allocateBatches(list, unknown).every(s => s.state === 'check' && s.remaining === null)).toBe(true);
    const over = balances([
      makeEvent('purchase', [{ ingredientId: 'Milk', delta: 100, basis: 'measured' }], new Date('2026-10-01T10:00:00Z')),
      makeEvent('use', [{ ingredientId: 'Milk', delta: -500, basis: 'measured' }], new Date('2026-10-02T10:00:00Z')),
    ]).get('Milk');
    expect(over?.needsCheck).toBe(true);
    expect(allocateBatches(list, over).every(s => s.state === 'check')).toBe(true);
  });
});

describe('use soon batches', () => {
  it('lists batches expiring within 3 days or past, urgent first, used-up ones last', () => {
    const list = [b('far', 500, '2026-10-20'), b('past', 500, '2026-10-03'), b('soon', 500, '2026-10-07'), b('edge', 500, '2026-10-08'), b('over', 500, '2026-10-09')];
    // stock 1000 goes to the two newest batches (far, over), so past, soon and edge may be used up
    const out = batchesUseSoon(list, new Map([['Milk', stockOf(1000)!]]), '2026-10-05');
    expect(out.map(x => x.status.batch.id)).toEqual(['past', 'soon', 'edge']);
    expect(out.every(x => x.status.state === 'may-be-used-up')).toBe(true);
    const more = batchesUseSoon(list, new Map([['Milk', stockOf(1500)!]]), '2026-10-05');
    expect(more.map(x => [x.status.batch.id, x.status.state])).toEqual([['edge', 'in-stock'], ['past', 'may-be-used-up'], ['soon', 'may-be-used-up']]);
    expect(more.find(x => x.status.batch.id === 'past')!.daysLeft).toBe(-2);
  });
  it('shows "check" for unknown stock', () => {
    const out = batchesUseSoon([b('x', 500, '2026-10-06')], unknownStock(), '2026-10-05');
    expect(out[0].status.state).toBe('check');
  });
  it('places leave out batches that may be used up', () => {
    const list = [b('old', 1000, '2026-10-06', { location: 'freezer' }), b('new', 1000, '2026-10-20')];
    const st = batchStatuses(list, new Map([['Milk', stockOf(1000)!]]));
    expect(placesFor('Milk', list, st)).toEqual(['Fridge']);
  });
});

describe('buildBatch', () => {
  const base = { id: 'x', ingredient: milk, location: 'fridge' as const };
  it('converts to base units and keeps the package size apart from the amount', () => {
    const r = buildBatch({ ...base, amount: 1.5, unit: 'L', expiresOn: '2026-10-09', packageAmount: 1, packageUnit: 'L' });
    expect(r).toMatchObject({ ok: true, batch: { amount: 1500, expiresOn: '2026-10-09', packageSize: { amount: 1, unit: 'L' } } });
  });
  it('refuses zero, bad units and bad dates, and only keeps frozenOn in the freezer', () => {
    expect(buildBatch({ ...base, amount: 0, unit: 'L' }).ok).toBe(false);
    expect(buildBatch({ ...base, amount: 1, unit: 'kg' }).ok).toBe(false);
    expect(buildBatch({ ...base, amount: 1, unit: 'L', expiresOn: 'tomorrow' }).ok).toBe(false);
    const fridge = buildBatch({ ...base, amount: 1, unit: 'L', frozenOn: '2026-10-05' });
    expect(fridge.ok && fridge.batch.frozenOn).toBeFalsy();
    const frozen = buildBatch({ ...base, location: 'freezer', amount: 1, unit: 'L', frozenOn: '2026-10-05' });
    expect(frozen.ok && frozen.batch.frozenOn).toBe('2026-10-05');
  });
  it('upsertById replaces rather than duplicates', () => {
    expect(upsertById([b('a', 1)], b('a', 2))).toEqual([b('a', 2)]);
  });
});
