import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { balances, makeEvent, reverse } from './ledger';
import { toBase } from './units';
import { basketFromPlan } from './basket';
import { cartLines, lowIsHidden, snoozed } from './cart';
import { addDish, cancelMeal, newMeal } from './plan';
import { defaultShopPrefs } from './shopPrefs';
import { finishTrip } from './trip';
import { chooseRepay, markPaid, newOrderCost, owedTotal, undoPaid } from './orderCosts';
import { testKitchen } from '../storage/testKitchen';
import { loadKitchen, openKitchenDb, replaceAll, saveTripDone } from '../storage/db';

const at = new Date('2026-10-05T10:00:00+05:00');

describe('independent review: exact acceptance examples', () => {
  it('AV02: a 500 g purchase minus 300 g cooking is 200 g; undo restores 500 g', () => {
    const purchase = makeEvent('purchase', [{ ingredientId: 'rice', delta: 500, basis: 'measured' }], at);
    const cook = makeEvent('cook', [{ ingredientId: 'rice', delta: -300, basis: 'measured' }], new Date(at.getTime() + 1));
    expect(balances([purchase, cook]).get('rice')?.amount).toBe(200);
    const reversal = reverse(cook, [purchase, cook], new Date(at.getTime() + 2));
    expect(balances([purchase, cook, reversal]).get('rice')?.amount).toBe(500);
  });

  it('AV03: adding a measured purchase to explicitly unknown stock does not invent a total', () => {
    const check = makeEvent('set-stock', [{ ingredientId: 'rice', delta: 0, setTo: null, basis: 'unknown' }], at);
    const buy = makeEvent('purchase', [{ ingredientId: 'rice', delta: 500, basis: 'measured' }], new Date(at.getTime() + 1));
    expect(balances([check, buy]).get('rice')?.amount).toBeNull();
  });

  it('AV04: a backdated cook recorded after a stock check subtracts from that check', () => {
    const check = makeEvent('set-stock', [{ ingredientId: 'rice', delta: 0, setTo: 900, basis: 'measured' }], at);
    const cook = makeEvent('cook', [{ ingredientId: 'rice', delta: -200, basis: 'measured' }], new Date('2026-10-03T10:00:00+05:00'), { recordedAt: new Date(at.getTime() + 1).toISOString() });
    expect(balances([cook, check]).get('rice')?.amount).toBe(700);
    expect(balances([check, cook]).get('rice')?.amount).toBe(700);
  });

  it('AV05: two meals needing two eggs each subtract the one egg in stock only once', () => {
    const kitchen = testKitchen();
    const recipe = kitchen.recipes[1];
    const plan = [addDish(newMeal('a', '2026-10-05', 'lunch', 2), recipe), addDish(newMeal('b', '2026-10-06', 'lunch', 2), recipe)];
    const stock = new Map([['Eggs', { amount: 1, basis: 'measured' as const, lastChanged: '2026-10-05' }]]);
    expect(basketFromPlan(plan, kitchen.recipes, stock, kitchen.ingredients, toBase, '2026-10-05', new Set())[0].amountBase).toBe(3);
    expect(basketFromPlan([plan[0], cancelMeal(plan[1])], kitchen.recipes, stock, kitchen.ingredients, toBase, '2026-10-05', new Set())[0].amountBase).toBe(1);
  });

  it('AV06: manual six, planned eight and low-stock five merge to eight, never nineteen', () => {
    const egg = { ...testKitchen().ingredients[1], minStock: 6 };
    const lines = cartLines({ manual: [{ ingredientId: 'Eggs', amountBase: 6, reason: 'dish', recipeIds: [] }],
      basket: [{ ingredientId: 'Eggs', amountBase: 8, plannedNeed: 9, stock: 1, reasons: ['planned'], meals: [] }],
      ingredients: [egg], stock: new Map([['Eggs', { amount: 1, basis: 'measured', lastChanged: '2026-10-05' }]]),
      today: '2026-10-05', prefs: defaultShopPrefs() });
    expect(lines).toHaveLength(1);
    expect(lines[0].amountBase).toBe(8);
    expect(lines[0].reasons).toMatchObject({ manual: true, low: true });
  });

  it('AV07: a seven-day snooze expires on 12 October, including across a month boundary', () => {
    const prefs = snoozed(defaultShopPrefs(), 'Eggs', '2026-10-05');
    expect(lowIsHidden(prefs.dismissed[0], '2026-10-11', 0)).toBe(true);
    expect(lowIsHidden(prefs.dismissed[0], '2026-10-12', 0)).toBe(false);
    expect(snoozed(defaultShopPrefs(), 'Eggs', '2026-10-29').dismissed[0].until).toBe('2026-11-05');
  });

  it('AV08: replaying a finished partial trip writes exactly one purchase', async () => {
    const prefs = { ...defaultShopPrefs(), trip: { id: 'review-trip', startedAt: at.toISOString(), got: { Eggs: 3 } } };
    const result = finishTrip(prefs, [{ ingredientId: 'Eggs', amountBase: 6, reason: 'dish', recipeIds: [] }], at, 'Asia/Karachi');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.list[0].amountBase).toBe(3);
    expect(result.event.id).toBe('trip-review-trip');
    const db = await openKitchenDb('independent-review-trip-once');
    try {
      await replaceAll(db, testKitchen());
      await saveTripDone(db, result.event, result.prefs);
      await saveTripDone(db, result.event, result.prefs);
      const saved = (await loadKitchen(db))!;
      expect(saved.events.filter(e => e.id === result.event.id)).toHaveLength(1);
      expect(balances(saved.events).get('Eggs')?.amount).toBe(15);
      expect(saved.shopPrefs?.trip).toBeUndefined();
    } finally { db.close(); }
  });

  it('AV09: mass converts exactly and count ingredients reject weight without an explicit rule', () => {
    const kitchen = testKitchen();
    expect(toBase(0.25, 'kg', kitchen.ingredients[0])).toEqual({ ok: true, value: 250 });
    expect(toBase(2, 'dozen', kitchen.ingredients[1])).toEqual({ ok: true, value: 24 });
    expect(toBase(2, 'kg', kitchen.ingredients[1]).ok).toBe(false);
  });

  it('AV10: events either side of Karachi midnight belong to different local days', () => {
    expect(makeEvent('use', [], new Date('2026-10-05T18:59:00Z')).localDate).toBe('2026-10-05');
    expect(makeEvent('use', [], new Date('2026-10-05T19:01:00Z')).localDate).toBe('2026-10-06');
  });

  it('AV11: half of Rs 2401 is Rs 1201; paid removes due and undo restores it', () => {
    const result = newOrderCost({ id: 'cost', place: 'Test', amount: 2401, localDate: '2026-10-05' });
    if (!result.ok) throw new Error(result.message);
    expect(owedTotal([result.order])).toBe(0);
    const half = chooseRepay(result.order, 'half');
    expect(owedTotal([half])).toBe(1201);
    const paid = markPaid(half, '2026-10-05');
    expect(owedTotal([paid])).toBe(0);
    expect(chooseRepay(paid, 'all')).toBe(paid);
    expect(owedTotal([undoPaid(paid)])).toBe(1201);
    expect(owedTotal([chooseRepay(undoPaid(paid), 'all')])).toBe(2401);
  });
});
