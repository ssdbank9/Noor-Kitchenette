// Add or edit a recipe (F40). Mostly buttons and chips; typing is only for names, exact
// amounts and notes. The sub-parts are defined at module level on purpose: a component
// created inside another component's render is a new component every time, which would
// reset the search box (and its focus) on every keystroke.

import { useRef, useState } from 'react';
import {
  amountChips, defaultAmountText, defaultUnit, DEFAULT_AISLES, emptyForm, formFromRecipe, makeNewIngredient, MAX_SERVES,
  MEAL_CHOICES, moveItem, MY_RECIPES, NEW_INGREDIENT_UNITS, newKey, recipeFromForm, searchIngredients, stepAmountText,
  TIME_CHIPS, unitOptions, type IngredientRowForm, type RecipeForm,
} from '../domain/recipeForm';
import type { Ingredient, MealSlot, Recipe } from '../domain/types';

export interface RecipeEditorProps {
  /** The recipe being edited; missing means a new one. */
  recipe?: Recipe;
  ingredients: Ingredient[];
  /** Categories the saved recipes already use. */
  categories: string[];
  defaultServings: number;
  yesWord: string;
  noWord: string;
  onSave: (recipe: Recipe, newIngredients: Ingredient[]) => void;
  /** Only offered for Noor's own recipes. */
  onDelete?: (recipeId: string) => void;
  onBack: () => void;
}

const trim = (n: number) => String(Number(n.toFixed(3)));

function IngredientPicker(p: {
  pool: Ingredient[];
  usedIds: Set<string>;
  aisles: string[];
  onPick: (ingredient: Ingredient) => void;
  onCreate: (ingredient: Ingredient) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<string>('g');
  const [aisle, setAisle] = useState('');
  const [error, setError] = useState('');
  const matches = searchIngredients(query, p.pool, p.usedIds);

  function create() {
    const made = makeNewIngredient({ name, unit, aisle }, p.pool);
    if (!made.ok) { setError(made.error); return; }
    p.onCreate(made.ingredient);
  }

  if (creating) {
    return (
      <section className="panel own-picker" aria-label="New ingredient">
        <h3 className="panel__title">New ingredient</h3>
        <label className="own-field">
          <span className="own-field__label">Name</span>
          <input className="input" value={name} maxLength={60} onChange={e => { setName(e.target.value); setError(''); }} />
        </label>
        <div role="group" aria-label="How it is counted" className="own-chips">
          {NEW_INGREDIENT_UNITS.map(u => (
            <button key={u} type="button" className="choice-chip" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === 'pc' ? 'pieces' : u}</button>
          ))}
        </div>
        <div role="group" aria-label="Aisle" className="own-chips">
          {p.aisles.map(a => (
            <button key={a} type="button" className="choice-chip" aria-pressed={aisle === a} onClick={() => { setAisle(aisle === a ? '' : a); setError(''); }}>{a}</button>
          ))}
        </div>
        {error && <p className="own-error" role="alert">{error}</p>}
        <div className="own-actions">
          <button type="button" className="button-save own-btn" onClick={create}>Add ingredient</button>
          <button type="button" className="button-outline own-btn" onClick={() => setCreating(false)}>Back to search</button>
        </div>
      </section>
    );
  }

  const typed = query.trim();
  return (
    <section className="panel own-picker" aria-label="Pick an ingredient">
      <input
        className="input"
        type="search"
        aria-label="Search ingredients"
        placeholder="Search ingredients"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <ul className="rows own-results">
        {matches.map(i => (
          <li key={i.id}>
            <button type="button" className="own-result" onClick={() => p.onPick(i)}>
              <span className="row__name">{i.name}</span>
              <span className="row__meta">{i.aisle}</span>
            </button>
          </li>
        ))}
      </ul>
      {matches.length === 0 && <p className="own-hint">Nothing matches{typed ? ` "${typed}"` : ''}.</p>}
      <div className="own-actions">
        <button type="button" className="button-tint own-btn" onClick={() => { setName(typed); setCreating(true); }}>
          {typed ? `Make "${typed}" a new ingredient` : 'Make a new ingredient'}
        </button>
        <button type="button" className="button-outline own-btn" onClick={p.onClose}>Close</button>
      </div>
    </section>
  );
}

function IngredientRow(p: {
  row: IngredientRowForm;
  ingredient: Ingredient | undefined;
  onChange: (patch: Partial<IngredientRowForm>) => void;
  onRemove: () => void;
}) {
  const { row, ingredient } = p;
  const name = ingredient?.name ?? 'Ingredient';
  const units = ingredient ? unitOptions(ingredient) : [row.unit];
  return (
    <li className="own-row">
      <div className="own-row__top">
        <span className="own-row__name">{name}</span>
        <button type="button" className="own-icon" aria-label={`Remove ${name}`} onClick={p.onRemove}>✕</button>
      </div>
      <div className="own-row__controls">
        <div className="own-amount">
          <button type="button" aria-label={`Less ${name}`} onClick={() => p.onChange({ amount: stepAmountText(row.amount, row.unit, -1) })}>−</button>
          <input
            className="input"
            inputMode="decimal"
            aria-label={`Amount of ${name}`}
            value={row.amount}
            onChange={e => p.onChange({ amount: e.target.value })}
          />
          <button type="button" aria-label={`More ${name}`} onClick={() => p.onChange({ amount: stepAmountText(row.amount, row.unit, 1) })}>+</button>
        </div>
        <select className="input own-unit" aria-label={`Unit for ${name}`} value={row.unit} onChange={e => p.onChange({ unit: e.target.value })}>
          {!units.includes(row.unit) && <option value={row.unit}>{row.unit}</option>}
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div className="own-chips own-chips--scroll" role="group" aria-label={`Quick amounts for ${name}`}>
        {amountChips(row.unit).map(c => (
          <button key={c} type="button" className="choice-chip" aria-pressed={Number(row.amount.replace(',', '.')) === c} onClick={() => p.onChange({ amount: trim(c) })}>{trim(c)}</button>
        ))}
      </div>
    </li>
  );
}

export function RecipeEditor(p: RecipeEditorProps) {
  const [form, setForm] = useState<RecipeForm>(() => (p.recipe ? formFromRecipe(p.recipe) : emptyForm(p.defaultServings)));
  const start = useRef(JSON.stringify(form));
  const [picking, setPicking] = useState(false);
  const [focusStep, setFocusStep] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<RecipeForm>) => setForm(f => ({ ...f, ...patch }));
  const pool = [...p.ingredients, ...form.newIngredients];
  const byId = new Map(pool.map(i => [i.id, i]));
  const usedIds = new Set(form.rows.map(r => r.ingredientId));
  const aisles = [...new Set([...DEFAULT_AISLES, ...pool.map(i => i.aisle)])];
  const categories = [MY_RECIPES, ...p.categories.filter(c => c !== MY_RECIPES)];
  const dirty = JSON.stringify(form) !== start.current;

  function addRow(ingredient: Ingredient) {
    const unit = defaultUnit(ingredient);
    setForm(f => ({ ...f, rows: [...f.rows, { key: newKey(), ingredientId: ingredient.id, unit, amount: defaultAmountText(unit) }] }));
    setPicking(false);
  }
  const changeRow = (key: string, patch: Partial<IngredientRowForm>) =>
    setForm(f => ({ ...f, rows: f.rows.map(r => (r.key === key ? { ...r, ...patch } : r)) }));
  const toggleMeal = (id: MealSlot) =>
    set({ meals: form.meals.includes(id) ? form.meals.filter(m => m !== id) : [...form.meals, id] });

  function save() {
    const result = recipeFromForm(form, p.recipe, { ingredients: p.ingredients });
    if (!result.ok) {
      setErrors(result.errors);
      requestAnimationFrame(() => errorsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    setErrors([]);
    p.onSave(result.recipe, result.newIngredients);
  }

  const back = () => (dirty ? setConfirm('leave') : p.onBack());

  return (
    <div className="screen form-screen own-editor">
      <header className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={back}>‹</button>
        <h1 className="title title--sm">{p.recipe ? 'Edit recipe' : 'Add recipe'}</h1>
      </header>

      {confirm === 'leave' && (
        <section className="panel own-confirm" role="alertdialog" aria-label="Leave without saving">
          <p className="panel__title">Leave without saving your changes?</p>
          <div className="own-actions">
            <button type="button" className="button-primary own-btn" onClick={p.onBack}>{p.yesWord}</button>
            <button type="button" className="button-outline own-btn" onClick={() => setConfirm(null)}>{p.noWord}</button>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="own-name-h">
        <h2 id="own-name-h" className="panel__title">Dish</h2>
        <label className="own-field">
          <span className="own-field__label">Name</span>
          <input className="input" value={form.name} maxLength={80} onChange={e => set({ name: e.target.value })} />
        </label>
        <div className="stepper-row panel--inline" role="group" aria-label="People it serves">
          <span className="stepper-row__label">Serves</span>
          <div className="stepper">
            <button type="button" aria-label="Fewer people" onClick={() => set({ serves: Math.max(1, form.serves - 1) })}>−</button>
            <output aria-live="polite">{form.serves}</output>
            <button type="button" aria-label="More people" onClick={() => set({ serves: Math.min(MAX_SERVES, form.serves + 1) })}>+</button>
          </div>
        </div>
        <div role="group" aria-label="Time" className="own-chips own-chips--scroll">
          {TIME_CHIPS.map(t => (
            <button key={t} type="button" className="choice-chip" aria-pressed={form.time === t} onClick={() => set({ time: t })}>{t}</button>
          ))}
        </div>
        <label className="own-field">
          <span className="own-field__label">Exact time</span>
          <input className="input" value={form.time} maxLength={30} placeholder="e.g. 1 hr 15 min" onChange={e => set({ time: e.target.value })} />
        </label>
      </section>

      <section className="panel" aria-labelledby="own-cat-h">
        <h2 id="own-cat-h" className="panel__title">Category</h2>
        <div role="group" aria-label="Category" className="own-chips">
          {categories.map(c => (
            <button key={c} type="button" className="choice-chip" aria-pressed={form.category === c} onClick={() => set({ category: form.category === c ? '' : c })}>{c}</button>
          ))}
        </div>
        <h2 className="panel__title">Suits which meals</h2>
        <div role="group" aria-label="Suits meals" className="own-chips">
          {MEAL_CHOICES.map(m => (
            <button key={m.id} type="button" className="choice-chip" aria-pressed={form.meals.includes(m.id)} onClick={() => toggleMeal(m.id)}>{m.label}</button>
          ))}
        </div>
        <p className="own-hint">With none picked, the dish can show up for any meal.</p>
      </section>

      <section className="panel" aria-labelledby="own-ing-h">
        <h2 id="own-ing-h" className="panel__title">Ingredients</h2>
        {form.rows.length > 0 && (
          <ul className="own-rows">
            {form.rows.map(r => (
              <IngredientRow
                key={r.key}
                row={r}
                ingredient={byId.get(r.ingredientId)}
                onChange={patch => changeRow(r.key, patch)}
                onRemove={() => setForm(f => ({ ...f, rows: f.rows.filter(x => x.key !== r.key) }))}
              />
            ))}
          </ul>
        )}
        {picking ? (
          <IngredientPicker
            pool={pool}
            usedIds={usedIds}
            aisles={aisles}
            onPick={addRow}
            onCreate={ing => { setForm(f => ({ ...f, newIngredients: [...f.newIngredients, ing] })); addRow(ing); }}
            onClose={() => setPicking(false)}
          />
        ) : (
          <button type="button" className="button-tint own-btn" onClick={() => setPicking(true)}>+ Add ingredient</button>
        )}
      </section>

      <section className="panel" aria-labelledby="own-steps-h">
        <h2 id="own-steps-h" className="panel__title">Steps</h2>
        {form.steps.length > 0 && (
          <ol className="own-steps">
            {form.steps.map((s, i) => (
              <li key={s.key} className="own-step">
                <textarea
                  className="input own-step__text"
                  aria-label={`Step ${i + 1}`}
                  rows={2}
                  maxLength={600}
                  autoFocus={s.key === focusStep}
                  value={s.text}
                  onChange={e => set({ steps: form.steps.map(x => (x.key === s.key ? { ...x, text: e.target.value } : x)) })}
                />
                <div className="own-step__buttons">
                  <button type="button" className="own-icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => set({ steps: moveItem(form.steps, i, -1) })}>↑</button>
                  <button type="button" className="own-icon" aria-label={`Move step ${i + 1} down`} disabled={i === form.steps.length - 1} onClick={() => set({ steps: moveItem(form.steps, i, 1) })}>↓</button>
                  <button type="button" className="own-icon" aria-label={`Remove step ${i + 1}`} onClick={() => set({ steps: form.steps.filter(x => x.key !== s.key) })}>✕</button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="button-tint own-btn" onClick={() => { const key = newKey(); setFocusStep(key); set({ steps: [...form.steps, { key, text: '' }] }); }}>+ Add step</button>
      </section>

      <section className="panel" aria-labelledby="own-more-h">
        <h2 id="own-more-h" className="panel__title">More (optional)</h2>
        <label className="own-field">
          <span className="own-field__label">Notes</span>
          <textarea className="input own-notes" rows={3} maxLength={1500} value={form.notes} onChange={e => set({ notes: e.target.value })} />
        </label>
        <label className="own-field">
          <span className="own-field__label">Written recipe link</span>
          <input className="input" type="url" inputMode="url" placeholder="https://" value={form.writtenUrl} onChange={e => set({ writtenUrl: e.target.value })} />
        </label>
        <label className="own-field">
          <span className="own-field__label">Video link</span>
          <input className="input" type="url" inputMode="url" placeholder="https://" value={form.videoUrl} onChange={e => set({ videoUrl: e.target.value })} />
        </label>
        <label className="own-field">
          <span className="own-field__label">Other spellings</span>
          <input className="input" value={form.aliases} placeholder="e.g. korma, qorma (comma between)" onChange={e => set({ aliases: e.target.value })} />
        </label>
      </section>

      {p.recipe?.personal && p.onDelete && (
        <section className="panel own-danger" aria-label="Delete this recipe">
          {confirm === 'delete' ? (
            <>
              <p className="panel__title">Delete {p.recipe.name}? Your cooking history keeps its name.</p>
              <div className="own-actions">
                <button type="button" className="button-primary own-btn" onClick={() => p.onDelete!(p.recipe!.id)}>{p.yesWord}</button>
                <button type="button" className="button-outline own-btn" onClick={() => setConfirm(null)}>{p.noWord}</button>
              </div>
            </>
          ) : (
            <button type="button" className="button-outline own-btn own-btn--danger" onClick={() => setConfirm('delete')}>Delete recipe</button>
          )}
        </section>
      )}

      {errors.length > 0 && (
        <div className="own-errors" role="alert" ref={errorsRef}>
          <strong>Almost there. Please fix:</strong>
          <ul>{errors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="action-bar">
        <button type="button" className="button-save action-bar__main" onClick={save}>Save recipe</button>
      </div>
    </div>
  );
}
