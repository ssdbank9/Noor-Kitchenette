import { useMemo, useState } from 'react';
import {
  cookingHistory, dishName, notCookedInAWhile, periodSummary, rangeDates, type HistoryRange,
} from '../domain/ledger';
import type { KitchenEvent, Recipe } from '../domain/types';

export interface HistoryScreenProps {
  events: KitchenEvent[];
  /** Household-local today, YYYY-MM-DD. */
  today: string;
  recipesById: Map<string, Recipe>;
  onUndo: (eventId: string) => void;
  /** F79: open a dish from "Not cooked in a while". */
  onOpenRecipe: (recipeId: string) => void;
}

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', chai: 'Chai', dinner: 'Dinner' } as const;
const RANGES: { id: HistoryRange; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

function rangeLabel(range: HistoryRange, today: string): string {
  if (range === 'week') return 'the last 7 days';
  if (range === 'year') return today.slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(today.slice(0, 7) + '-01T00:00:00Z'));
}

export function HistoryScreen(p: HistoryScreenProps) {
  const [range, setRange] = useState<HistoryRange>('month'); // F47
  const { startDate, endDate } = rangeDates(range, p.today);
  const summary = useMemo(() => periodSummary(p.events, startDate, endDate), [p.events, startDate, endDate]);
  const meals = useMemo(() => cookingHistory(p.events), [p.events]);
  const stale = useMemo(
    () => notCookedInAWhile(p.events, p.today, id => p.recipesById.has(id)),
    [p.events, p.today, p.recipesById],
  );
  const label = rangeLabel(range, p.today);
  const top = summary.byRecipe.slice(0, 5);
  const max = top[0]?.count ?? 1;
  return (
    <div className="screen form-screen history">
      <h1 className="title">What we've cooked</h1>

      <div className="filter-chips" role="group" aria-label="Show">
        {RANGES.map(r => (
          <button key={r.id} type="button" className="choice-chip" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>

      <section className="stat" aria-label={`Meals in ${label}`}>
        <div className="stat__num">{summary.meals}</div>
        <div className="stat__body">
          <div className="stat__label">{summary.meals === 1 ? 'meal' : 'meals'} in {label}</div>
          <ul className="chips">
            {(Object.keys(SLOT_LABEL) as (keyof typeof SLOT_LABEL)[]).map(s => (
              <li key={s} className="chip">{SLOT_LABEL[s]} {summary.bySlot[s]}</li>
            ))}
          </ul>
        </div>
      </section>

      {top.length > 0 && (
        <section className="panel" aria-labelledby="most">
          <h2 id="most" className="panel__title">Cooked most</h2>
          <ul className="bars">
            {top.map(r => (
              <li key={r.recipeId} className="bar">
                <span className="bar__name">{dishName({ recipeId: r.recipeId, recipeName: r.recipeName }, p.recipesById)}</span>
                <span className="bar__track"><span className="bar__fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
                <span className="bar__count">{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stale.length > 0 && ( // F79
        <section className="panel" aria-labelledby="stale">
          <h2 id="stale" className="panel__title">Not cooked in a while</h2>
          <ul className="rows">
            {stale.map(s => (
              <li key={s.recipeId} className="own-stale">
                <div className="row__main">
                  <span className="row__name">{p.recipesById.get(s.recipeId)?.name ?? s.recipeId}</span>
                  <span className="row__meta">Last cooked {s.lastDate}</span>
                </div>
                <button type="button" className="button-tint own-btn" aria-label={`Cook ${p.recipesById.get(s.recipeId)?.name ?? s.recipeId} again`} onClick={() => p.onOpenRecipe(s.recipeId)}>Cook again</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="log">
        <h2 id="log" className="section__title">Meals</h2>
        {meals.length === 0 ? (
          <p className="empty empty--flush">Nothing recorded yet. Tap "I cooked this" on a recipe.</p>
        ) : (
          <ul className="rows">
            {meals.map(m => (
              <li key={m.eventId} className="row">
                <div className="row__main">
                  <span className="row__name">{dishName(m.meal, p.recipesById)}</span>
                  <span className="row__meta">{m.localDate} · {SLOT_LABEL[m.meal.slot]} · for {m.meal.servings}</span>
                </div>
                <button type="button" className="button-tint" onClick={() => p.onUndo(m.eventId)}>Undo</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
