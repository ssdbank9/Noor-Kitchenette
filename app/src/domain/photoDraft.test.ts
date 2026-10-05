import { describe, expect, it } from 'vitest';
import type { DetectedItem } from '../gemini/drafts';
import { balances, reverse } from './ledger';
import {
  addSource, appendEventOnce, buildDraftEvent, checkThis, ingredientOf, linesFromPhoto, linesFromTyped,
  makeNewIngredient, newDraft, previewLine, updateLine, type Draft,
} from './photoDraft';
import type { Ingredient, KitchenEvent } from './types';

const ING: Ingredient[] = [
  { id: 'Tomato', name: 'Tomato', aliases: [], dimension: 'count', displayUnit: 'pc', aisle: 'Produce' },
  { id: 'Cooking_Oil', name: 'Cooking oil', aliases: ['Dalda'], dimension: 'mass', displayUnit: 'kg', aisle: 'Pantry' },
  { id: 'Rice', name: 'Rice', aliases: [], dimension: 'mass', displayUnit: 'kg', aisle: 'Pantry' },
];
const item = (o: Partial<DetectedItem>): DetectedItem => ({
  label: 'Tomatoes', count: null, packageSize: null, amount: null, certainty: 'sure', priceRs: null, ...o,
});
const NOW = new Date('2026-10-05T08:00:00Z');
const stockOf = (events: KitchenEvent[]) => balances(events);
const make = (kind: 'groceries' | 'receipt' | 'pantry', items: DetectedItem[], d?: Draft) => {
  const draft = d ?? newDraft(kind, 'evt-1');
  const lines = linesFromPhoto(items, kind, draft.sources + 1, ING);
  return addSource(draft, kind, lines, 'photo', '', ING);
};

describe('matching and defaults', () => {
  it("matches what was read to Noor's ingredient, including aliases", () => {
    const d = make('groceries', [item({ label: 'Tomatoes', amount: { amount: 6, unit: 'pc' } }), item({ label: 'Dalda', amount: { amount: 5, unit: 'kg' } })]);
    expect(d.lines.map(l => l.ingredientId)).toEqual(['Tomato', 'Cooking_Oil']);
    expect(d.lines.every(l => l.on)).toBe(true);
    expect(d.lines[0].basis).toBe('estimate');
  });
  it('leaves unmatched and unsure lines OFF with a reason', () => {
    const d = make('groceries', [
      item({ label: 'Mystery spice', amount: { amount: 100, unit: 'g' } }),
      item({ label: 'Rice', amount: { amount: 2, unit: 'kg' }, certainty: 'unsure' }),
    ]);
    expect(d.lines.map(l => l.on)).toEqual([false, false]);
    expect(checkThis(d.lines[0], undefined, 'purchase')).toBe('Pick which of yours this is');
    expect(checkThis(d.lines[1], ING[2], 'purchase')).toMatch(/not sure/i);
  });
  it('purchase quantity is count x package size when both exist, else the amount', () => {
    const d = make('groceries', [
      item({ label: 'Rice', count: 3, packageSize: { amount: 2, unit: 'kg' } }),
      item({ label: 'Tomato', count: 4, amount: { amount: 6, unit: 'pc' } }),
    ]);
    expect([d.lines[0].amount, d.lines[0].unit]).toEqual(['6', 'kg']);
    expect([d.lines[1].amount, d.lines[1].unit]).toEqual(['6', 'pc']);
  });
});

describe('package size is not a remaining amount', () => {
  it('a pantry line with only a package size stays off and asks how much is left', () => {
    const d = make('pantry', [item({ label: 'Rice', packageSize: { amount: 5, unit: 'kg' }, count: 1 })]);
    const line = d.lines[0];
    expect(line.amount).toBe('');
    expect(line.on).toBe(false);
    expect(line.packageNote).toBe('Package says 5 kg');
    expect(checkThis(line, ING[2], 'pantry')).toBe('How much is left?');
    expect(buildDraftEvent(d, ING, stockOf([]), NOW).ok).toBe(false);
  });
  it('becomes a remaining amount only after Noor types it, as measured', () => {
    let d = make('pantry', [item({ label: 'Rice', packageSize: { amount: 5, unit: 'kg' } })]);
    d = updateLine(d, d.lines[0].key, { type: 'quantity', amount: '1.5', unit: 'kg' }, ING);
    expect(d.lines[0].on).toBe(true);
    expect(d.lines[0].basis).toBe('measured');
    const r = buildDraftEvent(d, ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.event.kind).toBe('set-stock');
    expect(r.event.movements[0]).toMatchObject({ ingredientId: 'Rice', setTo: 1500, basis: 'measured' });
  });
});

describe('two photos of one shopping trip', () => {
  it('merges the same ingredient into one line, never summing, preferring the receipt', () => {
    let d = make('groceries', [item({ label: 'Rice', count: 1, packageSize: { amount: 5, unit: 'kg' } })]);
    d = make('receipt', [item({ label: 'Rice 5kg', count: 1, packageSize: { amount: 5, unit: 'kg' }, priceRs: 1400 })], d);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].seenIn).toEqual([1, 2]);
    expect(d.lines[0].amount).toBe('5');
    expect(d.lines[0].kind).toBe('receipt');
    expect(d.lines[0].priceRs).toBe(1400);
    const r = buildDraftEvent(d, ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.event.movements).toHaveLength(1);
    expect(r.event.movements[0].delta).toBe(5000);
    expect(r.event.source).toBe('receipt');
    expect(r.event.priceRs).toBe(1400);
  });
  it('keeps the first reading when neither is a receipt, and leaves an edited line alone', () => {
    let d = make('groceries', [item({ label: 'Rice', amount: { amount: 2, unit: 'kg' } })]);
    d = updateLine(d, d.lines[0].key, { type: 'quantity', amount: '3' }, ING);
    d = make('groceries', [item({ label: 'Rice', amount: { amount: 9, unit: 'kg' } })], d);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].amount).toBe('3');
  });
  it('omits priceRs when no included line has one', () => {
    const d = make('groceries', [item({ label: 'Rice', amount: { amount: 2, unit: 'kg' } })]);
    const r = buildDraftEvent(d, ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    expect('priceRs' in r.event).toBe(false);
    expect(r.event.source).toBe('photo');
  });
  it('sums receipt line prices of the included lines only', () => {
    let d = make('receipt', [
      item({ label: 'Rice', amount: { amount: 2, unit: 'kg' }, priceRs: 500 }),
      item({ label: 'Tomatoes', amount: { amount: 6, unit: 'pc' }, priceRs: 120.5 }),
      item({ label: 'Dalda', amount: { amount: 1, unit: 'kg' }, priceRs: 900, certainty: 'unsure' }),
    ]);
    const r = buildDraftEvent(d, ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.event.priceRs).toBe(620.5);
    d = updateLine(d, d.lines[2].key, { type: 'on', on: true }, ING);
    const r2 = buildDraftEvent(d, ING, stockOf([]), NOW);
    expect(r2.ok && r2.event.priceRs).toBe(1520.5);
  });
});

describe('editing', () => {
  it('fixing an unmatched line picks the ingredient and switches it on', () => {
    let d = make('groceries', [item({ label: 'Pyaz', amount: { amount: 1, unit: 'kg' } })]);
    expect(d.lines[0].on).toBe(false);
    d = updateLine(d, d.lines[0].key, { type: 'ingredient', ingredient: ING[2], isNew: false }, ING);
    expect(d.lines[0].ingredientId).toBe('Rice');
    expect(d.lines[0].on).toBe(true);
  });
  it('an invalid line cannot be switched on', () => {
    let d = make('groceries', [item({ label: 'Rice', amount: { amount: 2, unit: 'cup' } })]);
    expect(d.lines[0].on).toBe(false);
    d = updateLine(d, d.lines[0].key, { type: 'on', on: true }, ING);
    expect(d.lines[0].on).toBe(false);
  });
  it('a new ingredient is carried on the line and returned for saving only when used', () => {
    let d = make('groceries', [item({ label: 'Saffron', amount: { amount: 2, unit: 'g' } })]);
    const saffron = makeNewIngredient('Saffron', 'mass', ING);
    d = updateLine(d, d.lines[0].key, { type: 'ingredient', ingredient: saffron, isNew: true }, ING);
    expect(ingredientOf(d.lines[0], ING)?.id).toBe('Custom_Saffron');
    const r = buildDraftEvent(d, ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.newIngredients.map(i => i.id)).toEqual(['Custom_Saffron']);
    expect(makeNewIngredient('Saffron', 'mass', [...ING, saffron]).id).toBe('Custom_Saffron_2');
  });
});

describe('typed list', () => {
  it('feeds the same review and reports lines it cannot read', () => {
    const r = linesFromTyped('Chicken 500 g\nRice 2 kg\nTomatoes 6\nEggs -2', 'groceries', 1, ING);
    expect(r.lines.map(l => [l.label, l.amount, l.unit, l.ingredientId, l.on])).toEqual([
      ['Chicken', '500', 'g', null, false],
      ['Rice', '2', 'kg', 'Rice', true],
      ['Tomatoes', '6', 'pc', 'Tomato', true],
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^Line 4/);
  });
});

describe('save', () => {
  const draft = () => make('groceries', [item({ label: 'Tomatoes', amount: { amount: 6, unit: 'pc' } })]);
  it('uses the draft event id on every attempt', () => {
    const d = draft();
    const a = buildDraftEvent(d, ING, stockOf([]), new Date('2026-10-05T08:00:00Z'));
    const b = buildDraftEvent(d, ING, stockOf([]), new Date('2026-10-05T08:00:09Z'));
    if (!a.ok || !b.ok) throw new Error('build failed');
    expect(a.event.id).toBe('evt-1');
    expect(b.event.id).toBe('evt-1');
  });
  it('saving twice changes stock once', () => {
    const d = draft();
    const r = buildDraftEvent(d, ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    let events = appendEventOnce([], r.event);
    events = appendEventOnce(events, r.event);
    expect(events).toHaveLength(1);
    expect(stockOf(events).get('Tomato')?.amount).toBe(6);
  });
  it('undo restores stock (reversal of the single event)', () => {
    const r = buildDraftEvent(draft(), ING, stockOf([]), NOW);
    if (!r.ok) throw new Error(r.message);
    const events = [r.event];
    const undone = [...events, reverse(r.event, events, NOW)];
    expect(stockOf(undone).get('Tomato')?.amount ?? 0).toBe(0);
  });
  it('refuses to save when no line is on', () => {
    let d = draft();
    d = updateLine(d, d.lines[0].key, { type: 'on', on: false }, ING);
    expect(buildDraftEvent(d, ING, stockOf([]), NOW).ok).toBe(false);
  });
});

describe('before and after', () => {
  it('purchase adds to current stock; a pantry check replaces it with a difference as delta', () => {
    const base = make('groceries', [item({ label: 'Rice', amount: { amount: 2, unit: 'kg' } })]);
    const seed = buildDraftEvent(base, ING, stockOf([]), NOW);
    if (!seed.ok) throw new Error(seed.message);
    const stock = stockOf([seed.event]);
    const p1 = previewLine(base.lines[0], ING[2], 'purchase', stock.get('Rice'));
    expect(p1).toMatchObject({ before: 2000, after: 4000, delta: 2000 });

    let pantry = make('pantry', [item({ label: 'Rice', amount: { amount: 0.5, unit: 'kg' }, certainty: 'unsure' })]);
    pantry = updateLine(pantry, pantry.lines[0].key, { type: 'on', on: true }, ING);
    const p2 = previewLine(pantry.lines[0], ING[2], 'pantry', stock.get('Rice'));
    expect(p2).toMatchObject({ before: 2000, after: 500, delta: -1500 });
    const r = buildDraftEvent(pantry, ING, stock, NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.event.movements[0]).toMatchObject({ delta: -1500, setTo: 500, basis: 'estimate' });
    expect(stockOf([seed.event, r.event]).get('Rice')?.amount).toBe(500);
  });
});
