// The To-buy cart (D-22). One list that builds itself from low stock, the week's plan and what
// Noor adds by hand. Everything shown is derived (domain/cart.ts); only her choices are saved.
import { useState, type ReactNode } from 'react';
import { cartShareText, groupCart, removed, snoozed, type CartGrouping, type CartLine } from '../domain/cart';
import type { Balance } from '../domain/ledger';
import { removeItem, type ShoppingItem, type ShoppingList } from '../domain/shopping';
import { startTrip } from '../domain/trip';
import type { Ingredient, Recipe, ShopPrefs } from '../domain/types';
import { fromBase, toBase } from '../domain/units';
import { AddItemSheet, AlwaysKeepSheet } from './CartSheets';
import { TripScreen } from './TripScreen';

export interface ShopScreenProps {
  /** The manual list (items added by hand and "+ List" from a dish). */
  list: ShoppingList;
  /** D22: the whole cart, already combined (low stock + plan + manual). */
  lines: CartLine[];
  ingredients: Ingredient[];
  recipesById: Map<string, Recipe>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  /** Noor bought this much (base units) of an item; the pantry grows and the list shrinks. */
  onBought: (item: ShoppingItem, amountBase: number, fromBasket?: boolean) => void;
  onToast: (text: string, undo?: () => void) => void;
  // D22
  prefs: ShopPrefs;
  stock: Map<string, Balance>;
  /** Household-local date, YYYY-MM-DD. */
  today: string;
  yesWord: string;
  noWord: string;
  /** Saves the shop preferences (snoozes, removals, the trip). */
  onPrefs: (next: ShopPrefs) => void;
  onChangeList: (next: ShoppingList) => void;
  /** "Always keep...": the ingredient with its new minimum and usual buy amount. */
  onSaveIngredient: (ingredient: Ingredient) => void;
  /** "+ Add item": a manual line, and the ingredient when it is new. */
  onAddItem: (ingredient: Ingredient, isNew: boolean, amountBase: number) => void;
  /** Done shopping: `priceRs` is the optional total Noor typed. */
  onTripDone: (priceRs?: number) => void;
  /** Slot for another part of the app (for example where to buy) under each line. */
  extras?: (line: CartLine) => ReactNode;
  /** Slot above the list (for example a stores strip). */
  listExtras?: ReactNode;
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

const weekday = (localDate: string) =>
  new Date(`${localDate}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

/** Why a line is here, as short chips: Low, For <dish> <day>, Added, Always keep. */
export function cartChips(line: CartLine, recipesById: Map<string, Recipe>): string[] {
  const out: string[] = [];
  if (line.reasons.low) out.push('Low');
  if (line.reasons.plan?.length) {
    const seen = new Set<string>();
    const meals = line.meals.filter(m => (seen.has(m.recipeName) ? false : (seen.add(m.recipeName), true)));
    for (const m of meals.slice(0, 2)) out.push(`For ${m.recipeName} ${weekday(m.localDate)}`);
    if (meals.length > 2) out.push(`+${meals.length - 2} more dishes`);
  }
  if (line.reasons.manual) {
    if (line.manualRecipeIds.length) for (const id of line.manualRecipeIds) out.push(`For ${recipesById.get(id)?.name ?? id}`);
    else out.push('Added');
  }
  if (line.reasons.staple) out.push('Always keep');
  return out;
}

export function ShopScreen(p: ShopScreenProps) {
  const [buying, setBuying] = useState<string | null>(null);
  const [more, setMore] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [groupBy, setGroupBy] = useState<CartGrouping>('aisle');
  const byId = new Map(p.ingredients.map(i => [i.id, i]));

  if (p.prefs.trip) {
    return (
      <TripScreen
        lines={p.lines} ingredients={p.ingredients} prefs={p.prefs} format={p.format}
        yesWord={p.yesWord} noWord={p.noWord} groupBy={groupBy} onGroupBy={setGroupBy}
        onPrefs={p.onPrefs} onDone={p.onTripDone}
      />
    );
  }

  const groups = groupCart(p.lines, p.ingredients, groupBy, p.prefs);
  const count = p.lines.length;

  async function share() {
    const text = cartShareText(p.lines, p.ingredients, groupBy, p.prefs, p.format);
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

  function currentStock(id: string): number | null {
    const b = p.stock.get(id);
    return b && (b.amount === null || b.needsCheck) ? null : (b?.amount ?? 0);
  }
  function snooze(line: CartLine, ing: Ingredient) {
    const before = p.prefs;
    p.onPrefs(snoozed(p.prefs, line.ingredientId, p.today));
    setMore(null);
    p.onToast(`${ing.name} is off the list for a week.`, () => p.onPrefs(before));
  }
  function remove(line: CartLine, ing: Ingredient) {
    const before = p.prefs;
    const beforeList = p.list;
    if (line.reasons.low) p.onPrefs(removed(p.prefs, line.ingredientId, currentStock(line.ingredientId)));
    if (line.reasons.manual) p.onChangeList(removeItem(p.list, line.ingredientId));
    setMore(null);
    p.onToast(`${ing.name} removed. It comes back when it runs lower.`, () => { p.onPrefs(before); p.onChangeList(beforeList); });
  }

  const keepingIng = keeping ? byId.get(keeping) : undefined;

  return (
    <div className="screen shop">
      <header className="screen__header">
        <h1 className="title">To buy</h1>
        <div className="eyebrow">{count === 0 ? 'Nothing to buy' : `${count} ${count === 1 ? 'thing' : 'things'} to buy`}</div>
      </header>

      <div className="shop__actions">
        {count > 0 && <button type="button" className="button-primary shop__start" onClick={() => p.onPrefs(startTrip(p.prefs, new Date()))}>Start shopping</button>}
        <button type="button" className="button-outline" onClick={() => setAdding(true)}>+ Add item</button>
        {count > 0 && <button type="button" className="button-outline" onClick={share}>Share list</button>}
      </div>

      <div className="shop__actions" role="group" aria-label="Group by">
        <span className="shop__group-label">Group by</span>
        <button type="button" className="choice-chip" aria-pressed={groupBy === 'aisle'} onClick={() => setGroupBy('aisle')}>Aisle</button>
        <button type="button" className="choice-chip" aria-pressed={groupBy === 'store'} onClick={() => setGroupBy('store')}>Store</button>
      </div>

      {p.listExtras}

      {count === 0 && (
        <p className="empty">Nothing to buy. This list fills itself when something runs low or a dish is planned. You can also add an item.</p>
      )}

      {groups.map(g => (
        <section key={g.key} className="shop__group" aria-label={g.label}>
          <h2 className="shop__aisle">{g.label}</h2>
          <ul className="rows">
            {g.lines.map(line => {
              const ing = byId.get(line.ingredientId);
              if (!ing) return null;
              const item: ShoppingItem = { ingredientId: line.ingredientId, amountBase: line.amountBase, reason: 'dish', recipeIds: [] };
              const canHide = Boolean(line.reasons.low || line.reasons.manual);
              return (
                <li key={line.ingredientId} className="shop-item cart-line">
                  <div className="cart-line__top">
                    <div className="shop-item__text">
                      <span className="row__name">{ing.name}</span>
                      <ul className="cart-line__chips" aria-label={`Why ${ing.name} is here`}>
                        {cartChips(line, p.recipesById).map(c => <li key={c} className="chip">{c}</li>)}
                      </ul>
                    </div>
                    <span className={line.amountBase === null ? 'shop-item__amount shop-item__amount--check' : 'shop-item__amount'}>
                      {line.amountBase === null ? 'Check' : p.format(line.amountBase, ing)}
                    </span>
                  </div>
                  {p.extras?.(line)}
                  <div className="cart-line__actions">
                    <button type="button" className="button-primary cart-line__got" aria-label={`Got it: ${ing.name}`} aria-expanded={buying === line.ingredientId}
                      onClick={() => { setMore(null); setBuying(buying === line.ingredientId ? null : line.ingredientId); }}>Got it</button>
                    <button type="button" className="button-outline cart-line__more" aria-label={`More for ${ing.name}`} aria-expanded={more === line.ingredientId}
                      onClick={() => { setBuying(null); setMore(more === line.ingredientId ? null : line.ingredientId); }}>More</button>
                  </div>
                  {more === line.ingredientId && (
                    <div className="cart-line__menu" role="group" aria-label={`Options for ${ing.name}`}>
                      {line.reasons.low && <button type="button" className="button-outline" onClick={() => snooze(line, ing)}>Not this week</button>}
                      {canHide && <button type="button" className="button-outline" onClick={() => remove(line, ing)}>Remove</button>}
                      <button type="button" className="button-outline" onClick={() => { setMore(null); setKeeping(line.ingredientId); }}>Always keep...</button>
                      {!canHide && <p className="plan-note">This is here for a planned dish. Change the plan to take it off.</p>}
                    </div>
                  )}
                  {buying === line.ingredientId && (
                    <BuyPanel item={item} ingredient={ing} format={p.format} onCancel={() => setBuying(null)}
                      onPick={base => { setBuying(null); p.onBought(item, base); }} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {adding && (
        <AddItemSheet ingredients={p.ingredients} onClose={() => setAdding(false)}
          onAdd={(ing, isNew, amount) => { setAdding(false); p.onAddItem(ing, isNew, amount); }} />
      )}
      {keepingIng && (
        <AlwaysKeepSheet key={keepingIng.id} ingredient={keepingIng} onClose={() => setKeeping(null)}
          onSave={next => { setKeeping(null); p.onSaveIngredient(next); p.onToast(next.minStock !== undefined ? `Always keeping ${next.name}.` : `${next.name} is no longer always kept.`); }} />
      )}
    </div>
  );
}
