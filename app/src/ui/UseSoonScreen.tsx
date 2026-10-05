import { batchesUseSoon, locationLabel, type BatchState } from '../domain/batches';
import type { Balance } from '../domain/ledger';
import { dueText, leftoversUseSoon, prettyDate } from '../domain/leftoverUse';
import type { Batch, Ingredient, Leftover } from '../domain/types';

export interface UseSoonScreenProps {
  leftovers: Leftover[];
  batches: Batch[];
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  today: string;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onOpenLeftovers: () => void;
}

const STATE_TEXT: Record<BatchState, string> = {
  'in-stock': 'Probably still here',
  partly: 'Probably still here',
  'may-be-used-up': 'May be used up',
  check: 'Check stock',
};

/** What to use first: leftovers due within 2 days and ingredient batches expiring within 3 (F67). */
export function UseSoonScreen(p: UseSoonScreenProps) {
  const left = leftoversUseSoon(p.leftovers, p.today);
  const byId = new Map(p.ingredients.map(i => [i.id, i]));
  const batches = batchesUseSoon(p.batches, p.stock, p.today);
  return (
    <section className="depth" aria-label="Use soon">
      <p className="depth__note">Dates are a guide to what to use first, not a promise that food is safe or unsafe.</p>
      {left.length === 0 && batches.length === 0 && <p className="placeholder">Nothing needs using up soon.</p>}

      {left.length > 0 && (
        <div className="depth-group">
          <h2 className="depth-group__title">Leftovers</h2>
          <ul className="rows">
            {left.map(({ leftover: l, useBy, daysLeft }) => (
              <li key={l.id} className="depth-card depth-card--row">
                <div className="row__main">
                  <span className="row__name">{l.name}</span>
                  <span className="row__meta">{l.portionsLeft} {l.portionsLeft === 1 ? 'portion' : 'portions'} · {locationLabel(l.location)}</span>
                  <span className={daysLeft < 0 ? 'depth-due depth-due--late' : 'depth-due'}>Use by {dueText(daysLeft)} · {prettyDate(useBy)} (a guide)</span>
                </div>
                <button type="button" className="button-tint" onClick={p.onOpenLeftovers}>Open</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {batches.length > 0 && (
        <div className="depth-group">
          <h2 className="depth-group__title">Ingredients</h2>
          <ul className="rows">
            {batches.map(({ status, expiresOn, daysLeft }) => {
              const ing = byId.get(status.batch.ingredientId);
              const name = ing?.name ?? status.batch.ingredientId;
              return (
                <li key={status.batch.id} className="depth-card depth-card--row">
                  <div className="row__main">
                    <span className="row__name">{name}</span>
                    <span className="row__meta">
                      {ing ? p.format(status.batch.amount, ing) : ''} bought · {locationLabel(status.batch.location)}
                    </span>
                    <span className={daysLeft < 0 ? 'depth-due depth-due--late' : 'depth-due'}>Expires {dueText(daysLeft)} · {prettyDate(expiresOn)}</span>
                  </div>
                  <span className={`depth-flag depth-flag--${status.state}`}>{STATE_TEXT[status.state]}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
