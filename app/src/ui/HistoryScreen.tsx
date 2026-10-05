import type { CookedMeal, MonthSummary } from '../domain/ledger';
import type { Recipe } from '../domain/types';

export interface HistoryScreenProps {
  monthLabel: string;
  summary: MonthSummary;
  meals: CookedMeal[];
  recipesById: Map<string, Recipe>;
  onUndo: (eventId: string) => void;
}

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', chai: 'Chai', dinner: 'Dinner' } as const;

export function HistoryScreen(p: HistoryScreenProps) {
  const top = p.summary.byRecipe.slice(0, 5);
  const max = top[0]?.count ?? 1;
  return (
    <div className="screen form-screen history">
      <h1 className="title">What we've cooked</h1>

      <section className="stat" aria-label={`Meals in ${p.monthLabel}`}>
        <div className="stat__num">{p.summary.meals}</div>
        <div className="stat__body">
          <div className="stat__label">{p.summary.meals === 1 ? 'meal' : 'meals'} in {p.monthLabel}</div>
          <ul className="chips">
            {(Object.keys(SLOT_LABEL) as (keyof typeof SLOT_LABEL)[]).map(s => (
              <li key={s} className="chip">{SLOT_LABEL[s]} {p.summary.bySlot[s]}</li>
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
                <span className="bar__name">{p.recipesById.get(r.recipeId)?.name ?? r.recipeId}</span>
                <span className="bar__track"><span className="bar__fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
                <span className="bar__count">{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="log">
        <h2 id="log" className="section__title">Meals</h2>
        {p.meals.length === 0 ? (
          <p className="empty empty--flush">Nothing recorded yet. Tap "I cooked this" on a recipe.</p>
        ) : (
          <ul className="rows">
            {p.meals.map(m => (
              <li key={m.eventId} className="row">
                <div className="row__main">
                  <span className="row__name">{p.recipesById.get(m.meal.recipeId)?.name ?? m.meal.recipeId}</span>
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
