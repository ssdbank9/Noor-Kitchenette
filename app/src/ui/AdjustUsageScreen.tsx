import { useMemo, useState } from 'react';
import type { Ingredient, Movement } from '../domain/types';
import {
  displayAmount, exceedsStock, initialUsage, parseExact, quickChoices, stepUsed, usageMovements, type UsageLine,
} from '../domain/usage';

export interface AdjustUsageScreenProps {
  recipeName: string;
  lines: UsageLine[];
  ingredientsById: Map<string, Ingredient>;
  onBack: () => void;
  onSave: (movements: Movement[]) => void;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export function AdjustUsageScreen(p: AdjustUsageScreenProps) {
  const [used, setUsed] = useState<Record<string, number>>(() => initialUsage(p.lines));
  const [exact, setExact] = useState<Record<string, { text: string; error?: string }>>({});
  const movements = useMemo(() => usageMovements(p.lines, used), [p.lines, used]);

  const setAmount = (id: string, base: number) => {
    setUsed(u => ({ ...u, [id]: base }));
    setExact(e => (e[id] ? { ...e, [id]: { text: e[id].text } } : e));
  };
  const hasError = Object.values(exact).some(e => e.error);

  return (
    <div className="screen form-screen">
      <header className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <div>
          <div className="eyebrow">{p.recipeName}</div>
          <h1 className="title title--sm">What did you use?</h1>
        </div>
      </header>

      <ul className="usage-list">
        {p.lines.map(line => {
          const base = used[line.ingredientId];
          const open = exact[line.ingredientId];
          if (!line.editable) {
            return (
              <li key={line.ingredientId} className="usage-row usage-row--skipped">
                <div className="usage-row__name">{line.name}</div>
                <div className="usage-row__recipe">Recipe: {line.recipeAmount} {line.unit}</div>
                <p className="usage-row__note">Not deducted. {line.reason}</p>
              </li>
            );
          }
          const amount = displayAmount(line, base);
          const over = exceedsStock(line, base);
          const label = `${amount} ${line.unit}`;
          return (
            <li key={line.ingredientId} className="usage-row">
              <div className="usage-row__top">
                <div>
                  <div className="usage-row__name">{line.name}{line.optional ? ' (optional)' : ''}</div>
                  <div className="usage-row__recipe">Recipe: {line.recipeAmount} {line.unit}</div>
                </div>
              </div>
              <div className="stepper usage-row__stepper">
                <button type="button" aria-label={`Less ${line.name}`} disabled={base <= 0} onClick={() => setAmount(line.ingredientId, stepUsed(line, base, -1))}>−</button>
                <output aria-label={`${line.name} used`} aria-live="polite">{label}</output>
                <button type="button" aria-label={`More ${line.name}`} onClick={() => setAmount(line.ingredientId, stepUsed(line, base, 1))}>+</button>
              </div>
              <div className="usage-row__chips" role="group" aria-label={`Quick amounts for ${line.name}`}>
                {quickChoices(line).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="choice"
                    aria-pressed={same(c.base, base)}
                    onClick={() => setAmount(line.ingredientId, c.base)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {open ? (
                <div className="usage-row__exact">
                  <label htmlFor={`exact-${line.ingredientId}`}>Exact amount</label>
                  <div className="usage-row__exact-field">
                    <input
                      id={`exact-${line.ingredientId}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={open.text}
                      aria-invalid={Boolean(open.error)}
                      aria-describedby={open.error ? `exact-err-${line.ingredientId}` : undefined}
                      onChange={e => {
                        const text = e.target.value;
                        const ing = p.ingredientsById.get(line.ingredientId)!;
                        const r = parseExact(line, text, ing);
                        if (r.ok) {
                          setUsed(u => ({ ...u, [line.ingredientId]: r.base }));
                          setExact(x => ({ ...x, [line.ingredientId]: { text } }));
                        } else {
                          setExact(x => ({ ...x, [line.ingredientId]: { text, error: r.error } }));
                        }
                      }}
                    />
                    <span className="usage-row__unit">{line.unit}</span>
                  </div>
                  {open.error && <p id={`exact-err-${line.ingredientId}`} className="usage-row__error" role="alert">{open.error}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setExact(x => ({ ...x, [line.ingredientId]: { text: String(amount) } }))}
                >
                  Exact amount
                </button>
              )}
              {over && (
                <p className="usage-row__warn">More than recorded — stock will show &lsquo;check stock&rsquo;</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="action-bar">
        <button
          type="button"
          className="button-save action-bar__main"
          disabled={hasError}
          onClick={() => p.onSave(movements)}
        >
          Save
        </button>
        <p className="action-bar__hint">Stock changes by what you used. You can undo this anytime from History</p>
      </div>
    </div>
  );
}
