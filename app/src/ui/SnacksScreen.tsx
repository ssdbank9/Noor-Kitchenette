// The Snacks tab: noodles, chips, biscuits and anything else Noor wants kept in the house.
// Same stock and list rules as the rest of the app (F56 pantry actions, D-22 To-buy list); it is
// a focused view of the "Snacks & noodles" aisle, plus search-and-add for new snacks.
import { useState } from 'react';
import type { Balance } from '../domain/ledger';
import type { Ingredient, KitchenEvent } from '../domain/types';
import { AddItemSheet, SNACKS_AISLE } from './CartSheets';
import { PantrySheet } from './PantrySheet';

export interface SnacksScreenProps {
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  /** Called with the event a stock action built, and the text for its toast. */
  onAction: (event: KitchenEvent, toast: string) => void;
  /** Puts a snack (new or existing) on the To-buy list. */
  onAddItem: (ingredient: Ingredient, isNew: boolean, amountBase: number) => void;
}

function describe(i: Ingredient, b: Balance | undefined, format: SnacksScreenProps['format']) {
  const low = b?.amount != null && i.minStock != null && b.amount < i.minStock;
  const text =
    !b ? 'none'
    : b.amount === null ? 'not sure'
    : b.needsCheck ? 'check stock'
    : format(b.amount, i);
  return { low, text };
}

export function SnacksScreen(p: SnacksScreenProps) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const snacks = p.ingredients
    .filter(i => i.aisle === SNACKS_AISLE)
    .filter(i => !q || i.name.toLowerCase().includes(q) || i.aliases.some(a => a.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const open = openId ? p.ingredients.find(i => i.id === openId) : undefined;

  return (
    <div className="screen form-screen snacks">
      <header className="screen__header">
        <h1 className="title">Snacks</h1>
        <div className="eyebrow">Noodles, chips, biscuits and treats. Add whatever she likes.</div>
      </header>
      <div className="pantry-tools">
        <input type="search" className="pantry-search" aria-label="Search snacks" placeholder="Search snacks"
          autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <button type="button" className="button-primary plan-wide" onClick={() => setAdding(true)}>+ Add a snack</button>
      {snacks.length === 0 && <p className="placeholder">{q ? 'No snack called that yet. Tap "Add a snack" to add it.' : 'No snacks yet. Tap "Add a snack".'}</p>}
      <section className="pantry-group" aria-label="Snack list">
        {snacks.map(i => {
          const { low, text } = describe(i, p.stock.get(i.id), p.format);
          return (
            <div key={i.id} className="snack-row">
              <button type="button" className="pantry-item" onClick={() => setOpenId(i.id)}>
                <span>{i.name}</span>
                <span className={'pantry-item__amount' + (low ? ' pantry-item__amount--low' : '')}>{low ? 'Low · ' : ''}{text}</span>
              </button>
              {i.dimension === 'count' && (
                <button type="button" className="button-tint snack-row__list" aria-label={`Add ${i.name} to the list`}
                  onClick={() => p.onAddItem(i, false, i.buyAmount ?? 1)}>+ List</button>
              )}
            </div>
          );
        })}
      </section>
      {open && (
        <PantrySheet key={open.id} ingredient={open} balance={p.stock.get(open.id)}
          currentText={describe(open, p.stock.get(open.id), p.format).text}
          onClose={() => setOpenId(null)} onApply={(event, toast) => { setOpenId(null); p.onAction(event, toast); }} />
      )}
      {adding && (
        <AddItemSheet ingredients={p.ingredients} initialAisle={SNACKS_AISLE} onClose={() => setAdding(false)}
          onAdd={(ing, isNew, amount) => { setAdding(false); p.onAddItem(ing, isNew, amount); }} />
      )}
    </div>
  );
}
