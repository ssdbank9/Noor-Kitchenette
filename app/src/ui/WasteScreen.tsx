import { useMemo, useState } from 'react';
import type { HistoryRange } from '../domain/ledger';
import type { Ingredient, KitchenEvent, Leftover } from '../domain/types';
import { wasteReport } from '../domain/waste';

export interface WasteScreenProps {
  events: KitchenEvent[];
  leftovers: Leftover[];
  ingredients: Ingredient[];
  /** Household-local today, YYYY-MM-DD. */
  today: string;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onUndo: (eventId: string) => void;
}

const RANGES: { id: HistoryRange; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

/** F68: what was thrown away, what was used up, and how often stock was corrected. Three separate sections. */
export function WasteScreen(p: WasteScreenProps) {
  const [range, setRange] = useState<HistoryRange>('month');
  const r = useMemo(() => wasteReport(p.events, p.leftovers, range, p.today), [p.events, p.leftovers, range, p.today]);
  const byId = new Map(p.ingredients.map(i => [i.id, i]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const amount = (id: string, n: number) => { const i = byId.get(id); return i ? p.format(n, i) : String(n); };
  const thrownCount = r.thrown.ingredients.length + r.thrown.leftovers.length;

  return (
    <section className="depth" aria-label="Waste report">
      <div className="filter-chips" role="group" aria-label="Show">
        {RANGES.map(x => (
          <button key={x.id} type="button" className="choice-chip" aria-pressed={range === x.id} onClick={() => setRange(x.id)}>{x.label}</button>
        ))}
      </div>

      <div className="depth-group" role="region" aria-labelledby="w-thrown">
        <h2 id="w-thrown" className="depth-group__title">Thrown away</h2>
        {thrownCount === 0 ? <p className="placeholder">Nothing thrown away in this time. Well done.</p> : (
          <ul className="rows">
            {r.thrown.leftovers.map((t, i) => (
              <li key={`${t.leftoverId}-${i}`} className="depth-card depth-card--row">
                <div className="row__main">
                  <span className="row__name">{t.name}</span>
                  <span className="row__meta">Leftover · {t.portions} {t.portions === 1 ? 'portion' : 'portions'} · {t.localDate}</span>
                </div>
              </li>
            ))}
            {r.thrown.ingredients.map(t => (
              <li key={`${t.eventId}-${t.ingredientId}`} className="depth-card depth-card--row">
                <div className="row__main">
                  <span className="row__name">{name(t.ingredientId)}</span>
                  <span className="row__meta">{amount(t.ingredientId, t.amount)} · {t.localDate}</span>
                </div>
                <button type="button" className="button-tint" aria-label={`Undo thrown away ${name(t.ingredientId)}`} onClick={() => p.onUndo(t.eventId)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="depth-group" role="region" aria-labelledby="w-used">
        <h2 id="w-used" className="depth-group__title">Used up</h2>
        <p className="depth__note">Cooking and everyday use. This is food eaten, not wasted.</p>
        <p className="depth-count"><strong>{r.usedUp.mealsCooked}</strong> {r.usedUp.mealsCooked === 1 ? 'meal' : 'meals'} cooked · <strong>{r.usedUp.everyday.length}</strong> everyday {r.usedUp.everyday.length === 1 ? 'use' : 'uses'}</p>
        {r.usedUp.byIngredient.length > 0 && (
          <ul className="chips">
            {r.usedUp.byIngredient.slice(0, 6).map(u => <li key={u.ingredientId} className="chip">{name(u.ingredientId)} {amount(u.ingredientId, u.amount)}</li>)}
          </ul>
        )}
        {r.usedUp.everyday.length > 0 && (
          <ul className="rows">
            {r.usedUp.everyday.map(u => (
              <li key={`${u.eventId}-${u.ingredientId}`} className="depth-card depth-card--row">
                <div className="row__main">
                  <span className="row__name">{name(u.ingredientId)}</span>
                  <span className="row__meta">Used {amount(u.ingredientId, u.amount)} · {u.localDate}</span>
                </div>
                <button type="button" className="button-tint" aria-label={`Undo used ${name(u.ingredientId)}`} onClick={() => p.onUndo(u.eventId)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="depth-group" role="region" aria-labelledby="w-corr">
        <h2 id="w-corr" className="depth-group__title">Corrections</h2>
        <p className="depth__note">Times you checked what is left or marked something finished.</p>
        <p className="depth-count"><strong>{r.corrections.checks}</strong> {r.corrections.checks === 1 ? 'check' : 'checks'} · <strong>{r.corrections.changed}</strong> changed the stock</p>
        {r.corrections.entries.length > 0 && (
          <ul className="rows">
            {r.corrections.entries.map(c => (
              <li key={`${c.eventId}-${c.ingredientId}`} className="depth-card depth-card--row">
                <div className="row__main">
                  <span className="row__name">{name(c.ingredientId)}</span>
                  <span className="row__meta">
                    {c.setTo === null ? 'Marked not sure' : c.setTo !== undefined ? `Set to ${amount(c.ingredientId, c.setTo)}` : 'Adjusted'} · {c.delta === 0 ? 'no change' : 'stock changed'} · {c.localDate}
                  </span>
                </div>
                <button type="button" className="button-tint" aria-label={`Undo correction ${name(c.ingredientId)}`} onClick={() => p.onUndo(c.eventId)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
