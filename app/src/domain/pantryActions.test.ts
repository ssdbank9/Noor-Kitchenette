import { describe, expect, it } from 'vitest';
import { balances } from './ledger';
import { buildPantryEvent, parseAmountText, quickAmounts, unitsFor } from './pantryActions';
import type { Ingredient } from './types';

const tomato: Ingredient = { id: 'Tomato', name: 'Tomato', aliases: [], dimension: 'count', displayUnit: 'pc', aisle: 'Produce', minStock: 3 };
const rice: Ingredient = { id: 'Rice', name: 'Rice', aliases: [], dimension: 'mass', displayUnit: 'kg', aisle: 'Grains', conversions: { cup: 200 } };
const milk: Ingredient = { id: 'Milk', name: 'Milk', aliases: [], dimension: 'volume', displayUnit: 'L', aisle: 'Dairy' };
const now = new Date('2026-10-05T10:00:00+05:00');

function ok(r: ReturnType<typeof buildPantryEvent>) {
  if (!r.ok) throw new Error(r.message);
  return r.event;
}

describe('buildPantryEvent', () => {
  it('Bought more adds stock as a typed purchase, with optional price', () => {
    const e = ok(buildPantryEvent({ action: 'bought', ingredient: rice, amount: 2, unit: 'kg', instant: now, priceRs: 640 }));
    expect(e.kind).toBe('purchase');
    expect(e.source).toBe('typed');
    expect(e.priceRs).toBe(640);
    expect(e.movements).toEqual([{ ingredientId: 'Rice', delta: 2000, basis: 'measured' }]);
    expect(balances([e]).get('Rice')?.amount).toBe(2000);
  });

  it("Checked what's left sets a confirmed amount and clears needsCheck", () => {
    const used = ok(buildPantryEvent({ action: 'used', ingredient: tomato, amount: 5, unit: 'pc', instant: new Date('2026-10-05T09:00:00+05:00') }));
    const before = balances([used]).get('Tomato');
    expect(before?.needsCheck).toBe(true);
    const e = ok(buildPantryEvent({ action: 'checked', ingredient: tomato, amount: 2, unit: 'pc', instant: now, current: before }));
    expect(e.kind).toBe('set-stock');
    expect(e.movements[0]).toMatchObject({ setTo: 2, basis: 'measured' });
    const after = balances([used, e]).get('Tomato')!;
    expect(after.amount).toBe(2);
    expect(after.basis).toBe('measured');
    expect(after.needsCheck).toBeUndefined();
  });

  it('Not sure is unknown, never zero', () => {
    const e = ok(buildPantryEvent({ action: 'checked', ingredient: tomato, amount: null, instant: now }));
    expect(e.movements[0]).toMatchObject({ setTo: null, basis: 'unknown' });
    const b = balances([e]).get('Tomato')!;
    expect(b.amount).toBeNull();
    expect(b.basis).toBe('unknown');
  });

  it('Used some is a negative use event', () => {
    const e = ok(buildPantryEvent({ action: 'used', ingredient: milk, amount: 250, unit: 'ml', instant: now }));
    expect(e.kind).toBe('use');
    expect(e.movements[0].delta).toBe(-250);
  });

  it('Finished sets measured zero', () => {
    const e = ok(buildPantryEvent({ action: 'finished', ingredient: tomato, instant: now }));
    expect(e.kind).toBe('set-stock');
    expect(e.movements[0]).toMatchObject({ setTo: 0, basis: 'measured' });
    expect(balances([e]).get('Tomato')).toMatchObject({ amount: 0, basis: 'measured' });
  });

  it('Threw away is a negative waste event', () => {
    const e = ok(buildPantryEvent({ action: 'threw', ingredient: rice, amount: 1, unit: 'cup', instant: now }));
    expect(e.kind).toBe('waste');
    expect(e.movements[0].delta).toBe(-200);
  });

  it('refuses unconvertible units with a message', () => {
    const r = buildPantryEvent({ action: 'bought', ingredient: tomato, amount: 1, unit: 'kg', instant: now });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Tomato/);
    expect(buildPantryEvent({ action: 'used', ingredient: milk, amount: 1, unit: 'cup', instant: now }).ok).toBe(false);
  });

  it('refuses missing, negative and zero amounts (except a checked zero)', () => {
    expect(buildPantryEvent({ action: 'bought', ingredient: tomato, unit: 'pc', instant: now }).ok).toBe(false);
    expect(buildPantryEvent({ action: 'used', ingredient: tomato, amount: -1, unit: 'pc', instant: now }).ok).toBe(false);
    expect(buildPantryEvent({ action: 'bought', ingredient: tomato, amount: 0, unit: 'pc', instant: now }).ok).toBe(false);
    expect(buildPantryEvent({ action: 'checked', ingredient: tomato, amount: 0, unit: 'pc', instant: now }).ok).toBe(true);
  });
});

describe('pantry helpers', () => {
  it('unit picker offers only units the ingredient accepts', () => {
    expect(unitsFor(tomato)).toEqual(expect.arrayContaining(['pc', 'dozen']));
    expect(unitsFor(tomato)).not.toContain('kg');
    expect(unitsFor(rice)).toEqual(expect.arrayContaining(['g', 'kg', 'cup']));
    expect(unitsFor(rice)).not.toContain('ml');
  });
  it('quick amounts suit the unit', () => {
    expect(quickAmounts(rice).map(q => `${q.amount} ${q.unit}`)).toEqual(['250 g', '500 g', '1 kg', '1 cup']);
    expect(quickAmounts(tomato).map(q => `${q.amount} ${q.unit}`)).toEqual(['1 pc', '6 pc', '12 pc']);
  });
  it('parses exact amounts: decimals only, no negatives', () => {
    expect(parseAmountText('1.5')).toBe(1.5);
    expect(parseAmountText('.5')).toBe(0.5);
    expect(parseAmountText('-2')).toBeNull();
    expect(parseAmountText('abc')).toBeNull();
    expect(parseAmountText('')).toBeNull();
  });
});
