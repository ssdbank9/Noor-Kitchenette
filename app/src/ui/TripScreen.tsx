// Shopping trip mode (D-22): a big checklist for the shop floor. Tap a line to mark all of it
// picked up, use the stepper to record less, "Done shopping" saves ONE purchase. The trip is
// saved state (ShopPrefs.trip), so a reload or no signal loses nothing.
import { useState } from 'react';
import { groupCart, type CartGrouping, type CartLine } from '../domain/cart';
import { amountStep } from '../domain/recipeForm';
import type { Ingredient, ShopPrefs } from '../domain/types';
import { cancelTrip, setGot, toggleLine, tripProgress } from '../domain/trip';
import { fromBase, toBase } from '../domain/units';

export interface TripScreenProps {
  lines: CartLine[];
  ingredients: Ingredient[];
  prefs: ShopPrefs;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  yesWord: string;
  noWord: string;
  groupBy: CartGrouping;
  onGroupBy: (g: CartGrouping) => void;
  /** Saves the trip's prefs (picked amounts, or the trip gone when cancelled). */
  onPrefs: (next: ShopPrefs) => void;
  /** Done shopping: `priceRs` is the optional total Noor typed. */
  onDone: (priceRs?: number) => void;
}

/** One stepper press in base units: a whole pack or piece, or a quarter kilo, 50 g and so on. */
function stepBase(ing: Ingredient, around: number): number {
  const unit = fromBase(Math.max(around, 1), ing).unit;
  const step = ing.dimension === 'count' ? 1 : amountStep(unit);
  const r = toBase(step, unit, ing);
  return r.ok && r.value > 0 ? r.value : 1;
}

/** Rupees typed by hand: blank is fine (none), otherwise a number of zero or more. */
export function parseTotal(text: string): { ok: true; value?: number } | { ok: false } {
  const t = text.trim().replace(',', '.');
  if (!t) return { ok: true };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return { ok: false };
  const n = Number(t);
  return Number.isFinite(n) && n <= 100_000_000 ? { ok: true, value: n } : { ok: false };
}

function TripLine(p: { line: CartLine; ingredient: Ingredient; got: number; format: TripScreenProps['format']; onToggle: () => void; onSet: (base: number) => void }) {
  const { line, ingredient: ing, got } = p;
  const picked = got > 0;
  const complete = picked && (line.amountBase === null || got >= line.amountBase - 1e-9);
  const need = line.amountBase === null ? 'Check' : p.format(line.amountBase, ing);
  const status = !picked ? need
    : complete && line.amountBase !== null && Math.abs(got - line.amountBase) < 1e-9 ? need
    : line.amountBase !== null && got < line.amountBase ? `Got ${p.format(got, ing)} of ${need}`
    : `Got ${p.format(got, ing)}`;
  const step = stepBase(ing, got || line.amountBase || 1);
  return (
    <li className={`trip-line${complete ? ' trip-line--done' : picked ? ' trip-line--part' : ''}`}>
      <button type="button" className="trip-line__main" aria-pressed={picked} aria-label={`${ing.name}, ${status}`} onClick={p.onToggle}>
        <span className="trip-line__box" aria-hidden="true">{complete ? '✓' : picked ? '–' : ''}</span>
        <span className="trip-line__name">{ing.name}</span>
        <span className={`trip-line__qty${line.amountBase === null && !picked ? ' shop-item__amount--check' : ''}`}>{status}</span>
      </button>
      {picked && (
        <div className="trip-line__step" role="group" aria-label={`Amount of ${ing.name} you got`}>
          <button type="button" aria-label={`Less ${ing.name}`} onClick={() => p.onSet(Math.max(0, got - step))}>−</button>
          <output aria-label={`Got ${ing.name}`}>{p.format(got, ing)}</output>
          <button type="button" aria-label={`More ${ing.name}`} onClick={() => p.onSet(got + step)}>+</button>
        </div>
      )}
    </li>
  );
}

export function TripScreen(p: TripScreenProps) {
  const trip = p.prefs.trip!;
  const [cancelling, setCancelling] = useState(false);
  const [summary, setSummary] = useState(false);
  const [total, setTotal] = useState('');
  const [error, setError] = useState('');
  const byId = new Map(p.ingredients.map(i => [i.id, i]));
  const progress = tripProgress(trip, p.lines);
  const groups = groupCart(p.lines, p.ingredients, p.groupBy, p.prefs);
  const save = (next: typeof trip) => p.onPrefs({ ...p.prefs, trip: next });
  // Picked things that are no longer in the cart (it changed during the trip) are still bought.
  const extraIds = Object.keys(trip.got).filter(id => (trip.got[id] ?? 0) > 0 && !p.lines.some(l => l.ingredientId === id) && byId.has(id));
  const pickedIds = Object.keys(trip.got).filter(id => (trip.got[id] ?? 0) > 0 && byId.has(id));

  function confirm() {
    const t = parseTotal(total);
    if (!t.ok) return setError('Total spent must be a number, like 4500.');
    p.onDone(t.value);
  }

  if (summary) {
    return (
      <div className="screen shop trip">
        <header className="screen__header">
          <h1 className="title">Done shopping</h1>
          <div className="eyebrow">{pickedIds.length} {pickedIds.length === 1 ? 'item' : 'items'} picked up</div>
        </header>
        <ul className="rows trip-summary" aria-label="What you picked up">
          {pickedIds.map(id => {
            const ing = byId.get(id)!;
            return (
              <li key={id} className="trip-summary__row">
                <span className="row__name">{ing.name}</span>
                <span className="shop-item__amount">{p.format(trip.got[id], ing)}</span>
              </li>
            );
          })}
        </ul>
        <label className="plan-field">
          <span>Total spent in Rs (optional)</span>
          <input className="input" type="text" inputMode="decimal" autoComplete="off" placeholder="For example 4500" value={total}
            onChange={e => { setTotal(e.target.value); setError(''); }} />
        </label>
        {error && <p className="psheet__error" role="alert">{error}</p>}
        <p className="plan-note">Things you did not pick up stay on your list.</p>
        <div className="psheet__confirm">
          <button type="button" className="button-primary" onClick={confirm}>Save purchase</button>
          <button type="button" className="button-outline" onClick={() => { setSummary(false); setError(''); }}>Back to the list</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen shop trip">
      <header className="screen__header">
        <h1 className="title">Shopping</h1>
        <div className="eyebrow" role="status" aria-label="Trip progress">{progress.done} of {progress.total}</div>
        <div className="trip__bar" aria-hidden="true"><span style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} /></div>
      </header>

      <div className="shop__actions" role="group" aria-label="Group by">
        <button type="button" className="choice-chip" aria-pressed={p.groupBy === 'aisle'} onClick={() => p.onGroupBy('aisle')}>Aisle</button>
        <button type="button" className="choice-chip" aria-pressed={p.groupBy === 'store'} onClick={() => p.onGroupBy('store')}>Store</button>
      </div>

      {p.lines.length === 0 && extraIds.length === 0 && <p className="empty">Nothing is on the list now.</p>}

      {groups.map(g => (
        <section key={g.key} className="shop__group" aria-label={g.label}>
          <h2 className="shop__aisle">{g.label}</h2>
          <ul className="rows trip-lines">
            {g.lines.map(line => {
              const ing = byId.get(line.ingredientId);
              if (!ing) return null;
              return (
                <TripLine key={line.ingredientId} line={line} ingredient={ing} got={trip.got[line.ingredientId] ?? 0} format={p.format}
                  onToggle={() => save(toggleLine(trip, line, ing))}
                  onSet={base => save(setGot(trip, line.ingredientId, base))} />
              );
            })}
          </ul>
        </section>
      ))}

      {extraIds.length > 0 && (
        <section className="shop__group" aria-label="Also picked up">
          <h2 className="shop__aisle">Also picked up</h2>
          <ul className="rows trip-lines">
            {extraIds.map(id => {
              const ing = byId.get(id)!;
              const line: CartLine = { ingredientId: id, amountBase: null, reasons: {}, meals: [], manualRecipeIds: [], stock: null };
              return (
                <TripLine key={id} line={line} ingredient={ing} got={trip.got[id]} format={p.format}
                  onToggle={() => save(setGot(trip, id, 0))} onSet={base => save(setGot(trip, id, base))} />
              );
            })}
          </ul>
        </section>
      )}

      <div className="trip__actions">
        {cancelling ? (
          <div className="trip__cancel" role="group" aria-label="Cancel trip?">
            <p className="psheet__prompt">Cancel this trip? What you ticked is not saved.</p>
            <button type="button" className="button-primary" onClick={() => p.onPrefs(cancelTrip(p.prefs))}>{p.yesWord}</button>
            <button type="button" className="button-outline" onClick={() => setCancelling(false)}>{p.noWord}</button>
          </div>
        ) : (
          <>
            <button type="button" className="button-primary trip__done" disabled={!progress.anyPicked} onClick={() => setSummary(true)}>Done shopping</button>
            <button type="button" className="button-outline" onClick={() => setCancelling(true)}>Cancel trip</button>
          </>
        )}
      </div>
    </div>
  );
}
