import { useState } from 'react';
import { groupByAisle, shareText, type ShoppingItem, type ShoppingList } from '../domain/shopping';
import type { Ingredient, Recipe } from '../domain/types';
import { fromBase, toBase } from '../domain/units';

export interface ShopScreenProps {
  list: ShoppingList;
  ingredients: Ingredient[];
  recipesById: Map<string, Recipe>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onAddLowStock: () => void;
  /** Noor bought this much (base units) of an item; it leaves the list and the pantry grows. */
  onBought: (item: ShoppingItem, amountBase: number) => void;
  onToast: (text: string) => void;
}

const BASE_UNIT = { mass: 'g', volume: 'ml', count: 'pc' } as const;

function BuyPanel(p: { item: ShoppingItem; ingredient: Ingredient; format: ShopScreenProps['format']; onPick: (base: number) => void; onCancel: () => void }) {
  const { item, ingredient } = p;
  const [other, setOther] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const preferred = item.amountBase !== null ? fromBase(item.amountBase, ingredient).unit : ingredient.displayUnit;
  const unit = toBase(1, preferred, ingredient).ok ? preferred : BASE_UNIT[ingredient.dimension];

  function saveOther() {
    const value = Number(text.replace(',', '.'));
    if (!text.trim() || !Number.isFinite(value) || value <= 0) return setError('Type how much you bought, for example 2.');
    const r = toBase(value, unit, ingredient);
    if (!r.ok) return setError(r.reason);
    p.onPick(r.value);
  }

  return (
    <div className="buy" role="group" aria-label={`How much ${ingredient.name} did you buy?`}>
      <div className="buy__q">How much did you buy?</div>
      <div className="buy__chips">
        {item.amountBase !== null && (
          <>
            <button type="button" className="choice-chip" onClick={() => p.onPick(item.amountBase!)}>
              {p.format(item.amountBase, ingredient)}
            </button>
            <button type="button" className="choice-chip" onClick={() => p.onPick(item.amountBase! / 2)}>
              Half · {p.format(item.amountBase / 2, ingredient)}
            </button>
          </>
        )}
        <button type="button" className="choice-chip" aria-pressed={other} onClick={() => setOther(true)}>Other</button>
      </div>
      {other && (
        <div className="buy__other">
          <label className="buy__field">
            <span className="visually-hidden">Amount bought in {unit}</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              value={text}
              onChange={e => { setText(e.target.value); setError(''); }}
              placeholder="Amount"
            />
            <span className="buy__unit">{unit}</span>
          </label>
          <button type="button" className="button-primary buy__save" onClick={saveOther}>Add to pantry</button>
        </div>
      )}
      {error && <p className="buy__error" role="alert">{error}</p>}
      <button type="button" className="link-button" onClick={p.onCancel}>Cancel</button>
    </div>
  );
}

export function ShopScreen(p: ShopScreenProps) {
  const [buying, setBuying] = useState<string | null>(null);
  const byId = new Map(p.ingredients.map(i => [i.id, i]));
  const groups = groupByAisle(p.list, p.ingredients);

  async function share() {
    const text = shareText(p.list, p.ingredients, p.format);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Shopping list', text });
      } else {
        await navigator.clipboard.writeText(text);
        p.onToast('Shopping list copied.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') p.onToast('Could not share the list.');
    }
  }

  return (
    <div className="screen shop">
      <header className="screen__header">
        <h1 className="title">Shop</h1>
        <div className="eyebrow">{p.list.length === 0 ? 'Nothing to buy yet' : `${p.list.length} ${p.list.length === 1 ? 'item' : 'items'} to buy`}</div>
      </header>

      <div className="shop__actions">
        <button type="button" className="button-outline" onClick={p.onAddLowStock}>Add low-stock items</button>
        {p.list.length > 0 && <button type="button" className="button-outline" onClick={share}>Share list</button>}
      </div>

      {p.list.length === 0 && (
        <p className="empty">Nothing on the list. Tap + List on a dish or add low-stock items.</p>
      )}

      {groups.map(g => (
        <section key={g.aisle} className="shop__group" aria-label={g.aisle}>
          <h2 className="shop__aisle">{g.aisle}</h2>
          <ul className="rows">
            {g.items.map(item => {
              const ing = byId.get(item.ingredientId);
              if (!ing) return null;
              const why = item.reason === 'dish'
                ? 'For ' + item.recipeIds.map(id => p.recipesById.get(id)?.name ?? id).join(', ')
                : 'Running low';
              return (
                <li key={item.ingredientId} className="shop-item">
                  <div className="shop-item__line">
                    <button
                      type="button"
                      className="tick"
                      aria-label={`Bought ${ing.name}`}
                      aria-expanded={buying === item.ingredientId}
                      onClick={() => setBuying(buying === item.ingredientId ? null : item.ingredientId)}
                    />
                    <div className="shop-item__text">
                      <span className="row__name">{ing.name}</span>
                      <span className="shop-item__why">{why}</span>
                    </div>
                    <span className={item.amountBase === null ? 'shop-item__amount shop-item__amount--check' : 'shop-item__amount'}>
                      {item.amountBase === null ? 'Check' : p.format(item.amountBase, ing)}
                    </span>
                  </div>
                  {buying === item.ingredientId && (
                    <BuyPanel
                      item={item}
                      ingredient={ing}
                      format={p.format}
                      onCancel={() => setBuying(null)}
                      onPick={base => { setBuying(null); p.onBought(item, base); }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
