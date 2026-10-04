import type { Balance } from '../domain/ledger';
import type { Ingredient } from '../domain/types';

export interface PantryScreenProps {
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
}

/** Read-only pantry list for now; the Bought / Checked / Used / Finished / Threw away actions come next. */
export function PantryScreen(p: PantryScreenProps) {
  const groups = new Map<string, Ingredient[]>();
  for (const i of p.ingredients) groups.set(i.aisle, [...(groups.get(i.aisle) ?? []), i]);
  return (
    <div className="screen form-screen">
      <h1 className="title">Pantry</h1>
      <p className="eyebrow">Amounts marked "not confirmed" came from the old app and have not been checked.</p>
      {[...groups.entries()].map(([aisle, items]) => (
        <section key={aisle} className="pantry-group" aria-label={aisle}>
          <h2>{aisle}</h2>
          {items.map(i => {
            const b = p.stock.get(i.id);
            const low = b?.amount != null && i.minStock != null && b.amount < i.minStock;
            const text =
              !b ? 'none'
              : b.amount === null ? 'not sure'
              : b.needsCheck ? 'check stock'
              : p.format(b.amount, i) + (b.basis === 'estimate' ? ' · not confirmed' : '');
            const cls = 'pantry-item__amount' + (low ? ' pantry-item__amount--low' : b?.basis !== 'measured' && b ? ' pantry-item__amount--unconfirmed' : '');
            return (
              <div key={i.id} className="pantry-item">
                <span>{i.name}</span>
                <span className={cls}>{low ? 'Low · ' : ''}{text}</span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
