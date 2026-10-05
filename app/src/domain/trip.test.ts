import { describe, expect, it } from 'vitest';
import type { CartLine } from './cart';
import { activeEvents, balances, effectiveIds, reverse } from './ledger';
import { defaultShopPrefs } from './shopPrefs';
import type { ShoppingList } from './shopping';
import { cancelTrip, finishTrip, isComplete, setGot, startTrip, takeFromList, toggleLine, tripEventId, tripProgress, wholeAmount } from './trip';
import type { Ingredient, KitchenEvent } from './types';

const NOW = new Date('2026-10-05T10:00:00+05:00');
const ing = (id: string, extra: Partial<Ingredient> = {}): Ingredient => ({ id, name: id, aliases: [], dimension: 'mass', displayUnit: 'kg', aisle: 'A', ...extra });
const line = (id: string, amountBase: number | null): CartLine => ({ ingredientId: id, amountBase, reasons: { low: true }, meals: [], manualRecipeIds: [], stock: 0 });
const started = () => startTrip(defaultShopPrefs(), NOW, 't1');

describe('starting and cancelling', () => {
  it('creates an empty trip with a stable id', () => {
    const p = started();
    expect(p.trip).toEqual({ id: 't1', startedAt: NOW.toISOString(), got: {} });
  });
  it('starting again keeps the trip going (a double tap changes nothing)', () => {
    const p = started();
    expect(startTrip(p, new Date(), 'other')).toBe(p);
  });
  it('cancelling drops the trip and leaves the rest of the prefs', () => {
    const p = cancelTrip({ ...started(), preferred: { A: 'local' } });
    expect(p.trip).toBeUndefined();
    expect(p.preferred).toEqual({ A: 'local' });
  });
});

describe('picking up', () => {
  it('tapping marks the whole amount, tapping again puts it back', () => {
    const l = line('Rice', 1000);
    const t1 = toggleLine(started().trip!, l, ing('Rice'));
    expect(t1.got).toEqual({ Rice: 1000 });
    expect(isComplete(t1, l)).toBe(true);
    expect(toggleLine(t1, l, ing('Rice')).got).toEqual({});
  });
  it('a partial pick records less and the line is not complete', () => {
    const l = line('Eggs', 2);
    const t = setGot(started().trip!, 'Eggs', 1);
    expect(t.got).toEqual({ Eggs: 1 });
    expect(isComplete(t, l)).toBe(false);
  });
  it('setting zero or less clears it; amounts are rounded', () => {
    expect(setGot(setGot(started().trip!, 'X', 0.1 + 0.2), 'X', 0.3).got).toEqual({ X: 0.3 });
    expect(setGot(setGot(started().trip!, 'X', 5), 'X', -1).got).toEqual({});
  });
  it('a Check line records one usual buy, else one display unit, and counts complete once anything is picked', () => {
    const buldak = ing('Buldak', { dimension: 'count', displayUnit: 'pack', buyAmount: 5, conversions: { pack: 1 } });
    expect(wholeAmount(line('Buldak', null), buldak)).toBe(5);
    expect(wholeAmount(line('Rice', null), ing('Rice'))).toBe(1000);
    const t = toggleLine(started().trip!, line('Rice', null), ing('Rice'));
    expect(isComplete(t, line('Rice', null))).toBe(true);
  });
  it('progress counts lines fully picked out of all lines', () => {
    const lines = [line('A', 2), line('B', 1), line('C', 3)];
    let t = started().trip!;
    expect(tripProgress(t, lines)).toEqual({ done: 0, total: 3, anyPicked: false });
    t = setGot(setGot(t, 'A', 1), 'B', 1);
    expect(tripProgress(t, lines)).toEqual({ done: 1, total: 3, anyPicked: true });
  });
});

describe('finishing', () => {
  const list: ShoppingList = [
    { ingredientId: 'Rice', amountBase: 1000, reason: 'dish', recipeIds: [] },
    { ingredientId: 'Eggs', amountBase: 12, reason: 'dish', recipeIds: [] },
    { ingredientId: 'Salt', amountBase: 500, reason: 'dish', recipeIds: [] },
  ];
  const prefsWith = (got: Record<string, number>) => ({ ...started(), trip: { ...started().trip!, got } });

  it('refuses when nothing is picked or there is no trip', () => {
    expect(finishTrip(prefsWith({}), list, NOW, 'Asia/Karachi').ok).toBe(false);
    expect(finishTrip(defaultShopPrefs(), list, NOW, 'Asia/Karachi').ok).toBe(false);
  });
  it('refuses a bad total', () => {
    expect(finishTrip(prefsWith({ Rice: 1 }), list, NOW, 'Asia/Karachi', -5).ok).toBe(false);
    expect(finishTrip(prefsWith({ Rice: 1 }), list, NOW, 'Asia/Karachi', Number.NaN).ok).toBe(false);
  });
  it('makes ONE purchase with a stable id and one measured movement per picked item', () => {
    const r = finishTrip(prefsWith({ Rice: 1000, Eggs: 6 }), list, NOW, 'Asia/Karachi', 3200);
    if (!r.ok) throw new Error(r.message);
    expect(r.event.id).toBe(tripEventId({ id: 't1' }));
    expect(r.event.id).toBe('trip-t1');
    expect(r.event.kind).toBe('purchase');
    expect(r.event.source).toBe('typed');
    expect(r.event.priceRs).toBe(3200);
    expect(r.event.movements).toEqual([
      { ingredientId: 'Rice', delta: 1000, basis: 'measured' },
      { ingredientId: 'Eggs', delta: 6, basis: 'measured' },
    ]);
    expect(r.prefs.trip).toBeUndefined();
  });
  it('leaves the price off when none was typed', () => {
    const r = finishTrip(prefsWith({ Rice: 1 }), list, NOW, 'Asia/Karachi');
    if (!r.ok) throw new Error(r.message);
    expect('priceRs' in r.event).toBe(false);
  });
  it('removes picked manual lines, shortens partly picked ones, keeps the unpicked', () => {
    const r = finishTrip(prefsWith({ Rice: 1000, Eggs: 6 }), list, NOW, 'Asia/Karachi');
    if (!r.ok) throw new Error(r.message);
    expect(r.list).toEqual([
      { ingredientId: 'Eggs', amountBase: 6, reason: 'dish', recipeIds: [] },
      { ingredientId: 'Salt', amountBase: 500, reason: 'dish', recipeIds: [] },
    ]);
  });
  it('removes a manual Check line once anything of it is picked', () => {
    const r = finishTrip(prefsWith({ Rice: 3 }), [{ ingredientId: 'Rice', amountBase: null, reason: 'dish', recipeIds: [] }], NOW, 'Asia/Karachi');
    if (!r.ok) throw new Error(r.message);
    expect(r.list).toEqual([]);
  });
  it('clears an old "not this week" for what was bought', () => {
    const prefs = { ...prefsWith({ Rice: 1 }), dismissed: [{ ingredientId: 'Rice', kind: 'snooze' as const, until: '2026-10-12' }, { ingredientId: 'Salt', kind: 'snooze' as const, until: '2026-10-12' }] };
    const r = finishTrip(prefs, list, NOW, 'Asia/Karachi');
    if (!r.ok) throw new Error(r.message);
    expect(r.prefs.dismissed.map(d => d.ingredientId)).toEqual(['Salt']);
  });
  it('a retry (or double tap) replaces the event by id and never doubles stock', () => {
    const p = prefsWith({ Rice: 1000 });
    const a = finishTrip(p, list, NOW, 'Asia/Karachi');
    const b = finishTrip(p, list, new Date(NOW.getTime() + 5000), 'Asia/Karachi');
    if (!a.ok || !b.ok) throw new Error('finish failed');
    expect(b.event.id).toBe(a.event.id);
    // The database replaces by id (put); modelled here as keeping the latest per id.
    const stored = new Map<string, KitchenEvent>();
    for (const e of [a.event, b.event]) stored.set(e.id, e);
    expect(balances([...stored.values()]).get('Rice')!.amount).toBe(1000);
  });
  it('undo reverses the whole trip purchase; the trip itself is not restored', () => {
    const r = finishTrip(prefsWith({ Rice: 1000, Eggs: 6 }), list, NOW, 'Asia/Karachi');
    if (!r.ok) throw new Error(r.message);
    const events = [r.event];
    const rev = reverse(r.event, events, NOW);
    const all = [...events, rev];
    expect(effectiveIds(all).has(r.event.id)).toBe(false);
    expect(activeEvents(all)).toEqual([]);
    expect(balances(all).size).toBe(0);
  });
});

describe('takeFromList', () => {
  it('leaves the list alone when nothing was bought', () => {
    const list: ShoppingList = [{ ingredientId: 'Rice', amountBase: 1000, reason: 'dish', recipeIds: [] }];
    expect(takeFromList(list, {})).toEqual(list);
  });
  it('shortens a part-bought line and removes a fully bought or over-bought one', () => {
    const list: ShoppingList = [
      { ingredientId: 'A', amountBase: 10, reason: 'dish', recipeIds: [] },
      { ingredientId: 'B', amountBase: 10, reason: 'dish', recipeIds: [] },
      { ingredientId: 'C', amountBase: 10, reason: 'dish', recipeIds: [] },
    ];
    expect(takeFromList(list, { A: 4, B: 10, C: 12 }).map(i => [i.ingredientId, i.amountBase])).toEqual([['A', 6]]);
  });
});
