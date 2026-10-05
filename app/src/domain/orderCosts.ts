// Restaurant orders Aly paid for (D-23). Noor logs the cost and chooses one of two ways to pay
// Aly back: all of it, or half. Money amounts are whole rupees; half rounds up so nothing is lost.
import type { OrderCost } from './types';

export type RepayOption = 'all' | 'half';

export const MAX_ORDER_RS = 1_000_000;

/** The rupees to pay back for an option. */
export const repayAmount = (amount: number, option: RepayOption): number =>
  option === 'all' ? amount : Math.ceil(amount / 2);

export function newOrderCost(input: { id: string; place: string; amount: number; localDate: string }):
  { ok: true; order: OrderCost } | { ok: false; message: string } {
  const place = input.place.trim().slice(0, 80);
  const amount = Math.round(input.amount);
  if (!place) return { ok: false, message: 'Type the restaurant first.' };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, message: 'Type how much the order cost.' };
  if (amount > MAX_ORDER_RS) return { ok: false, message: 'That amount looks too big.' };
  return { ok: true, order: { id: input.id, place, amount, localDate: input.localDate } };
}

/** Chooses (or changes) how much to pay back. Not allowed once it is marked paid. */
export function chooseRepay(o: OrderCost, option: RepayOption): OrderCost {
  if (o.repay?.paidOn) return o;
  return { ...o, repay: { option, amount: repayAmount(o.amount, option) } };
}

export function markPaid(o: OrderCost, today: string): OrderCost {
  return o.repay && !o.repay.paidOn ? { ...o, repay: { ...o.repay, paidOn: today } } : o;
}

export function undoPaid(o: OrderCost): OrderCost {
  if (!o.repay?.paidOn) return o;
  const { option, amount } = o.repay;
  return { ...o, repay: { option, amount } };
}

/** Still to pay Aly: chosen but not yet marked paid. Orders with no choice yet are not counted. */
export const owedTotal = (list: OrderCost[]): number =>
  list.reduce((n, o) => n + (o.repay && !o.repay.paidOn ? o.repay.amount : 0), 0);

export function addOrder(list: OrderCost[], o: OrderCost): OrderCost[] {
  return [o, ...list.filter(x => x.id !== o.id)];
}

export const replaceOrder = (list: OrderCost[], o: OrderCost): OrderCost[] => list.map(x => (x.id === o.id ? o : x));
