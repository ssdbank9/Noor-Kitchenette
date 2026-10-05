import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { seed } from '../data/seed';
import { exportBackup, parseBackup } from '../storage/backup';
import { kitchenWriter, loadKitchen, openKitchenDb, replaceAll } from '../storage/db';
import { addOrder, chooseRepay, markPaid, newOrderCost, owedTotal, repayAmount, undoPaid } from './orderCosts';
import type { OrderCost } from './types';

const order = (amount = 2401): OrderCost => {
  const r = newOrderCost({ id: 'o1', place: ' Burger Lab ', amount, localDate: '2026-10-05' });
  if (!r.ok) throw new Error(r.message);
  return r.order;
};

describe('order costs', () => {
  it('pays back all or half, half rounding up to a whole rupee', () => {
    expect(repayAmount(2400, 'all')).toBe(2400);
    expect(repayAmount(2400, 'half')).toBe(1200);
    expect(repayAmount(2401, 'half')).toBe(1201);
  });

  it('needs a restaurant and a positive amount', () => {
    expect(newOrderCost({ id: 'x', place: '  ', amount: 100, localDate: '2026-10-05' }).ok).toBe(false);
    expect(newOrderCost({ id: 'x', place: 'A', amount: 0, localDate: '2026-10-05' }).ok).toBe(false);
    expect(newOrderCost({ id: 'x', place: 'A', amount: NaN, localDate: '2026-10-05' }).ok).toBe(false);
    expect(order().place).toBe('Burger Lab');
  });

  it('counts only chosen, unpaid amounts as owed, and can switch or undo before paid', () => {
    let o = order(2400);
    expect(owedTotal([o])).toBe(0);
    o = chooseRepay(o, 'half');
    expect(owedTotal([o])).toBe(1200);
    o = chooseRepay(o, 'all');
    expect(owedTotal([o])).toBe(2400);
    const paid = markPaid(o, '2026-10-06');
    expect(owedTotal([paid])).toBe(0);
    expect(chooseRepay(paid, 'half')).toBe(paid); // cannot change once paid
    expect(owedTotal([undoPaid(paid)])).toBe(2400);
    expect(addOrder([o], o)).toHaveLength(1);
  });
});

describe('order costs storage', () => {
  const full = { ...seed, orderCosts: [chooseRepay(order(2400), 'half')] };

  it('are saved, replayed idempotently, restored and backed up', async () => {
    const db = await openKitchenDb(`orders-${Math.random()}`);
    await replaceAll(db, seed);
    const write = kitchenWriter(db);
    await write({ type: 'orderCosts', list: full.orderCosts });
    await write({ type: 'orderCosts', list: full.orderCosts });
    expect((await loadKitchen(db))!.orderCosts).toEqual(full.orderCosts);
    await replaceAll(db, seed);
    expect((await loadKitchen(db))!.orderCosts).toBeUndefined();

    const parsed = parseBackup(exportBackup(full));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    if (parsed.ok) expect(parsed.data.orderCosts).toEqual(full.orderCosts);
    const bad = JSON.parse(exportBackup(full));
    bad.orderCosts[0].repay.option = 'third';
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    expect(parseBackup(exportBackup(seed)).ok).toBe(true);
  });
});
