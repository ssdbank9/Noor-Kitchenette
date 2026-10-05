// "Orders I owe Aly for" (D-23). Aly pays for foodpanda orders; Noor logs what one cost and picks
// one of two ways to pay it back: all of it, or half. Money is whole rupees, saved on the phone only.
import { useState } from 'react';
import { addOrder, chooseRepay, markPaid, newOrderCost, owedTotal, replaceOrder, undoPaid, type RepayOption } from '../domain/orderCosts';
import type { OrderCost } from '../domain/types';

export interface OrderCostsPanelProps {
  orders: OrderCost[];
  today: string;
  onChange: (list: OrderCost[]) => void;
  onToast: (text: string) => void;
}

const rs = (n: number) => `Rs ${n.toLocaleString('en-PK')}`;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `o-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

export function OrderCostsPanel(p: OrderCostsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [place, setPlace] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const owed = owedTotal(p.orders);

  function save() {
    const r = newOrderCost({ id: newId(), place, amount: Number(amount.replace(/[, ]/g, '')), localDate: p.today });
    if (!r.ok) return setError(r.message);
    p.onChange(addOrder(p.orders, r.order));
    setAdding(false); setPlace(''); setAmount(''); setError('');
    p.onToast(`Saved ${r.order.place}, ${rs(r.order.amount)}. Now choose how much to pay back.`);
  }
  function choose(o: OrderCost, option: RepayOption) {
    const next = chooseRepay(o, option);
    p.onChange(replaceOrder(p.orders, next));
    p.onToast(`Paying back ${rs(next.repay!.amount)} for ${o.place}.`);
  }
  function paid(o: OrderCost) {
    p.onChange(replaceOrder(p.orders, markPaid(o, p.today)));
    p.onToast(`Marked ${o.place} as paid back.`);
  }

  return (
    <section className="eatout__pad eatout__section ordercost" aria-labelledby="eo-costs">
      <div className="eatout__head">
        <h2 id="eo-costs" className="panel__title">Orders Aly paid for</h2>
        {!adding && <button type="button" className="button-tint" onClick={() => setAdding(true)}>Log an order</button>}
      </div>
      {owed > 0 && <p className="ordercost__owed" role="status">To pay back to Aly: <strong>{rs(owed)}</strong></p>}

      {adding && (
        <div className="eatout__card ordercost__form">
          <label className="plan-field"><span>Restaurant</span>
            <input className="input" type="text" maxLength={80} autoComplete="off" value={place} onChange={e => { setPlace(e.target.value); setError(''); }} />
          </label>
          <label className="plan-field"><span>What it cost (Rs)</span>
            <input className="input" type="text" inputMode="numeric" autoComplete="off" placeholder="For example 2400" value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="eatout__actions">
            <button type="button" className="button-primary" onClick={save}>Save order</button>
            <button type="button" className="button-outline" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {p.orders.length === 0 && !adding && <p className="eatout__empty">No orders logged yet.</p>}
      {p.orders.map(o => (
        <article key={o.id} className="eatout__card ordercost__item" aria-label={`Order ${o.place}`}>
          <div className="ordercost__top">
            <strong>{o.place}</strong>
            <span>{rs(o.amount)}</span>
          </div>
          <div className="ordercost__date">{o.localDate}</div>
          {!o.repay && (
            <div className="eatout__actions" role="group" aria-label={`Pay back for ${o.place}`}>
              <button type="button" className="button-primary" onClick={() => choose(o, 'all')}>Pay back all, {rs(o.amount)}</button>
              <button type="button" className="button-outline" onClick={() => choose(o, 'half')}>Pay back half, {rs(Math.ceil(o.amount / 2))}</button>
            </div>
          )}
          {o.repay && !o.repay.paidOn && (
            <>
              <p className="ordercost__status">Paying back {rs(o.repay.amount)} ({o.repay.option === 'all' ? 'all' : 'half'})</p>
              <div className="eatout__actions">
                <button type="button" className="button-primary" onClick={() => paid(o)}>Paid back<span className="eatout__sr"> {o.place}</span></button>
                <button type="button" className="button-outline" onClick={() => choose(o, o.repay!.option === 'all' ? 'half' : 'all')}>
                  Change to {o.repay.option === 'all' ? 'half' : 'all'}<span className="eatout__sr"> for {o.place}</span>
                </button>
              </div>
            </>
          )}
          {o.repay?.paidOn && (
            <>
              <p className="ordercost__status ordercost__status--done">Paid back {rs(o.repay.amount)} on {o.repay.paidOn}</p>
              <button type="button" className="button-outline" onClick={() => p.onChange(replaceOrder(p.orders, undoPaid(o)))}>Not paid yet<span className="eatout__sr"> {o.place}</span></button>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
