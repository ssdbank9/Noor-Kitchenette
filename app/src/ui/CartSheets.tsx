// Bottom sheets for the To-buy cart (D-22): "+ Add item" and "Always keep...". Every part is a
// top-level component so typing in a search or amount box never loses focus.
import { useState } from 'react';
import {
  amountChips, defaultUnit, DEFAULT_AISLES, makeNewIngredient, NEW_INGREDIENT_UNITS, parseAmountText, searchIngredients, stepAmountText,
  unitOptions,
} from '../domain/recipeForm';
import type { Ingredient } from '../domain/types';
import { fromBase, toBase } from '../domain/units';
import { Sheet } from './PlanSheets';

export interface AmountValue { text: string; unit: string }

/** What an amount box shows for a base-unit amount, in the ingredient's own units. */
export function valueFromBase(base: number | null | undefined, ing: Ingredient): AmountValue {
  const options = unitOptions(ing);
  if (base === null || base === undefined) return { text: '', unit: defaultUnit(ing) };
  const shown = fromBase(base, ing);
  return options.includes(shown.unit) ? { text: String(shown.amount), unit: shown.unit } : { text: '', unit: defaultUnit(ing) };
}

/** The typed amount in base units, or why it cannot be used. Never guessed. */
export function amountToBase(v: AmountValue, ing: Ingredient): { ok: true; value: number } | { ok: false; message: string } {
  const n = parseAmountText(v.text);
  if (n === null) return { ok: false, message: 'Type an amount above zero, for example 2.' };
  const r = toBase(n, v.unit, ing);
  return r.ok ? { ok: true, value: Math.round(r.value * 1000) / 1000 } : { ok: false, message: r.reason };
}

export function AmountField(p: { ingredient: Ingredient; label: string; value: AmountValue; onChange: (v: AmountValue) => void }) {
  const { ingredient, value } = p;
  const units = unitOptions(ingredient);
  const chips = amountChips(value.unit);
  return (
    <div className="cart-amount" role="group" aria-label={p.label}>
      <p className="psheet__prompt">{p.label}</p>
      <div className="psheet__stepper">
        <button type="button" aria-label={`Less ${p.label}`} onClick={() => p.onChange({ ...value, text: stepAmountText(value.text, value.unit, -1) })}>−</button>
        <label className="psheet__exact">
          <span>Exact amount</span>
          <input type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={value.text}
            onChange={e => p.onChange({ ...value, text: e.target.value })} />
        </label>
        <button type="button" aria-label={`More ${p.label}`} onClick={() => p.onChange({ ...value, text: stepAmountText(value.text, value.unit, 1) })}>+</button>
      </div>
      <div className="psheet__chips" role="group" aria-label={`Quick amounts for ${p.label}`}>
        {chips.map(c => (
          <button key={c} type="button" className="psheet__chip" onClick={() => p.onChange({ ...value, text: String(c) })}>{c} {value.unit}</button>
        ))}
      </div>
      {units.length > 1 && (
        <label className="psheet__field">
          <span>Unit</span>
          <select value={value.unit} onChange={e => p.onChange({ ...value, unit: e.target.value })}>
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export interface AddItemSheetProps {
  ingredients: Ingredient[];
  onAdd: (ingredient: Ingredient, isNew: boolean, amountBase: number) => void;
  onClose: () => void;
}

const SNACKS = 'Snacks & noodles';

/** "+ Add item": search what Noor already has on record, or make a new item. Saves one manual line. */
export function AddItemSheet(p: AddItemSheetProps) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Ingredient | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<string>('pc');
  const [aisle, setAisle] = useState('');
  const [amount, setAmount] = useState<AmountValue>({ text: '1', unit: 'pc' });
  const [error, setError] = useState('');
  const aisles = [...new Set([...DEFAULT_AISLES, SNACKS, ...p.ingredients.map(i => i.aisle)])];
  const [browse, setBrowse] = useState('');
  const found = searchIngredients(query, p.ingredients, new Set(), browse ? 200 : 8);
  const matches = browse ? found.filter(i => i.aisle === browse) : found;
  const typed = query.trim();

  function pick(ing: Ingredient) {
    setChosen(ing);
    setAmount({ text: '1', unit: defaultUnit(ing) });
    setError('');
  }
  function save() {
    if (chosen) {
      const r = amountToBase(amount, chosen);
      if (!r.ok) return setError(r.message);
      return p.onAdd(chosen, false, r.value);
    }
    const made = makeNewIngredient({ name, unit, aisle }, p.ingredients);
    if (!made.ok) return setError(made.error);
    const r = amountToBase(amount, made.ingredient);
    if (!r.ok) return setError(r.message);
    p.onAdd(made.ingredient, true, r.value);
  }

  // The amount box for a new item is built against the ingredient it will become.
  const draft: Ingredient | null = chosen ?? (creating ? previewIngredient(name, unit, aisle, p.ingredients) : null);

  return (
    <Sheet title="Add an item" onClose={p.onClose}>
      {!chosen && !creating && (
        <>
          <input className="input" type="search" role="searchbox" aria-label="Search items" placeholder="Search items" autoFocus
            value={query} onChange={e => setQuery(e.target.value)} />
          <div role="group" aria-label="Browse by aisle" className="own-chips">
            {aisles.map(a => (
              <button key={a} type="button" className="choice-chip" aria-pressed={browse === a}
                onClick={() => setBrowse(browse === a ? '' : a)}>{a}</button>
            ))}
          </div>
          <ul className="rows plan-picks">
            {matches.map(i => (
              <li key={i.id}>
                <button type="button" className="plan-pick" aria-label={`Choose ${i.name}`} onClick={() => pick(i)}>
                  <span className="plan-pick__text"><span className="row__name">{i.name}</span><span className="row__need">{i.aisle}</span></span>
                </button>
              </li>
            ))}
          </ul>
          {matches.length === 0 && typed && <p className="empty empty--flush">Nothing called "{typed}" yet.</p>}
          <button type="button" className="button-outline plan-wide" onClick={() => { setCreating(true); setName(typed); setAisle(browse); setError(''); }}>
            {typed ? `Add "${typed}" as a new item` : 'A new item'}
          </button>
        </>
      )}

      {chosen && <p className="psheet__prompt">{chosen.name}</p>}

      {creating && (
        <>
          <label className="plan-field">
            <span>Name</span>
            <input className="input" type="text" maxLength={60} value={name} onChange={e => { setName(e.target.value); setError(''); }} />
          </label>
          <div role="group" aria-label="How it is counted" className="own-chips">
            {NEW_INGREDIENT_UNITS.map(u => (
              <button key={u} type="button" className="choice-chip" aria-pressed={unit === u}
                onClick={() => { setUnit(u); setAmount({ text: '1', unit: u }); setError(''); }}>{u === 'pc' ? 'pieces' : u}</button>
            ))}
          </div>
          <div role="group" aria-label="Aisle" className="own-chips">
            {aisles.map(a => (
              <button key={a} type="button" className="choice-chip" aria-pressed={aisle === a}
                onClick={() => { setAisle(aisle === a ? '' : a); setError(''); }}>{a}</button>
            ))}
          </div>
        </>
      )}

      {draft && (
        <AmountField ingredient={draft} label="How much to buy" value={amount} onChange={v => { setAmount(v); setError(''); }} />
      )}
      {error && <p className="psheet__error" role="alert">{error}</p>}
      {(chosen || creating) && (
        <div className="psheet__confirm">
          <button type="button" className="button-primary" onClick={save}>Add to list</button>
          <button type="button" className="button-outline" onClick={() => { setChosen(null); setCreating(false); setError(''); }}>Back</button>
        </div>
      )}
    </Sheet>
  );
}

/** A stand-in ingredient so the amount box knows the unit while the new item is being described. */
function previewIngredient(name: string, unit: string, aisle: string, existing: Ingredient[]): Ingredient {
  const made = makeNewIngredient({ name: name.trim() || 'New item', unit, aisle: aisle || 'Other' }, existing.filter(i => i.name !== name));
  return made.ok ? made.ingredient : { id: 'new', name: 'New item', aliases: [], dimension: 'count', displayUnit: 'pc', aisle: 'Other' };
}

export interface AlwaysKeepSheetProps {
  ingredient: Ingredient;
  onSave: (ingredient: Ingredient) => void;
  onClose: () => void;
}

/** "Always keep...": a minimum and a usual buy amount, in the ingredient's own units. */
export function AlwaysKeepSheet(p: AlwaysKeepSheetProps) {
  const { ingredient } = p;
  const [min, setMin] = useState<AmountValue>(valueFromBase(ingredient.minStock ?? null, ingredient));
  const [buy, setBuy] = useState<AmountValue>(valueFromBase(ingredient.buyAmount ?? null, ingredient));
  const [error, setError] = useState('');

  function save() {
    const m = amountToBase(min, ingredient);
    if (!m.ok) return setError(`Keep at least: ${m.message}`);
    let buyAmount: number | undefined;
    if (buy.text.trim()) {
      const b = amountToBase(buy, ingredient);
      if (!b.ok) return setError(`Usually buy: ${b.message}`);
      buyAmount = b.value;
    }
    const { minStock: _m, buyAmount: _b, ...rest } = ingredient;
    p.onSave({ ...rest, minStock: m.value, ...(buyAmount !== undefined ? { buyAmount } : {}) });
  }
  function stop() {
    const { minStock: _m, buyAmount: _b, ...rest } = ingredient;
    p.onSave(rest);
  }

  return (
    <Sheet title={`Always keep ${ingredient.name}`} onClose={p.onClose}>
      <p className="plan-note">When there is less than this left, it goes on the list by itself.</p>
      <AmountField ingredient={ingredient} label="Keep at least" value={min} onChange={v => { setMin(v); setError(''); }} />
      <AmountField ingredient={ingredient} label="Usually buy" value={buy} onChange={v => { setBuy(v); setError(''); }} />
      {error && <p className="psheet__error" role="alert">{error}</p>}
      <div className="psheet__confirm">
        <button type="button" className="button-primary" onClick={save}>Save</button>
        {ingredient.minStock !== undefined && <button type="button" className="button-outline" onClick={stop}>Stop always keeping it</button>}
      </div>
    </Sheet>
  );
}
