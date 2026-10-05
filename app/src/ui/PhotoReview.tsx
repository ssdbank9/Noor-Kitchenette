// Snap pantry review (F28-F30, F52, F53, F57, F73): one editable line per item Gemini read.
// Nothing here changes stock; Noor fixes each line, switches on the ones she trusts, and taps
// Save. The pure rules live in domain/photoDraft.ts.
import { useState } from 'react';
import type { Balance } from '../domain/ledger';
import {
  checkLine,
  checkThis,
  ingredientOf,
  includedLines,
  previewLine,
  unitOptions,
  type Draft,
  type DraftLine,
  type LinePatch,
} from '../domain/photoDraft';
import { parseAmountText, quickAmounts, stepFor } from '../domain/pantryActions';
import type { Dimension, Ingredient } from '../domain/types';
import { normaliseUnit } from '../domain/units';

export interface PhotoReviewProps {
  draft: Draft;
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  saving: boolean;
  error: string;
  /** Shown above the lines, e.g. that another photo is waiting. */
  notice?: string;
  onChange: (key: string, patch: LinePatch) => void;
  /** Noor made a new ingredient for this line. */
  onCreate: (key: string, name: string, dimension: Dimension) => void;
  onSave: () => void;
  onAddPhoto: () => void;
  onDiscard: () => void;
}

const trim = (n: number) => String(Math.round(n * 1000) / 1000);

const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'mass', label: 'By weight' },
  { id: 'volume', label: 'By volume' },
  { id: 'count', label: 'By count' },
];

function dimensionFor(unit: string): Dimension {
  const u = normaliseUnit(unit);
  return u === 'g' || u === 'kg' ? 'mass' : u === 'ml' || u === 'L' ? 'volume' : 'count';
}

/** Search box + list. A module-level component so typing never remounts it and focus stays. */
function IngredientPicker(p: {
  ingredients: Ingredient[];
  startName: string;
  defaultDimension: Dimension;
  onPick: (ingredient: Ingredient) => void;
  onNew: (name: string, dimension: Dimension) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(p.startName);
  const [dimension, setDimension] = useState<Dimension>(p.defaultDimension);
  const q = query.trim().toLowerCase();
  const matches = p.ingredients
    .filter(i => !q || i.name.toLowerCase().includes(q) || i.aliases.some(a => a.toLowerCase().includes(q)))
    .slice(0, 8);

  if (creating) {
    return (
      <div className="snappick">
        <label className="snapfield">
          <span>Name of the new ingredient</span>
          <input className="input" type="text" autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <div className="snapchips" role="group" aria-label="How it is measured">
          {DIMENSIONS.map(d => (
            <button key={d.id} type="button" className="choice-chip" aria-pressed={dimension === d.id} onClick={() => setDimension(d.id)}>{d.label}</button>
          ))}
        </div>
        <div className="snaprow">
          <button type="button" className="button-primary" disabled={!name.trim()} onClick={() => p.onNew(name, dimension)}>Create ingredient</button>
          <button type="button" className="button-outline" onClick={() => setCreating(false)}>Back</button>
        </div>
      </div>
    );
  }
  return (
    <div className="snappick">
      <input
        className="input"
        type="search"
        aria-label="Search your ingredients"
        placeholder="Search your ingredients"
        autoComplete="off"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <ul className="snappick__list">
        {matches.map(i => (
          <li key={i.id}>
            <button type="button" className="snappick__item" onClick={() => p.onPick(i)}>{i.name}</button>
          </li>
        ))}
        {matches.length === 0 && <li className="snappick__none">Nothing matches.</li>}
      </ul>
      <div className="snaprow">
        <button type="button" className="button-tint" onClick={() => setCreating(true)}>New ingredient</button>
        <button type="button" className="button-outline" onClick={p.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ReviewLine(p: {
  line: DraftLine;
  draft: Draft;
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: PhotoReviewProps['format'];
  onChange: PhotoReviewProps['onChange'];
  onCreate: PhotoReviewProps['onCreate'];
}) {
  const { line, draft, onChange } = p;
  const [picking, setPicking] = useState(false);
  const ing = ingredientOf(line, p.ingredients);
  const mode = draft.mode;
  const reason = checkThis(line, ing, mode);
  const valid = checkLine(line, ing, mode).ok;
  const preview = previewLine(line, ing, mode, ing ? p.stock.get(ing.id) : undefined);
  const chips = ing ? quickAmounts(ing) : [];
  const units = unitOptions(ing);
  const unitKnown = units.includes(normaliseUnit(line.unit) ?? line.unit);
  const parsed = parseAmountText(line.amount);
  const nudge = (dir: 1 | -1) => onChange(line.key, { type: 'quantity', amount: trim(Math.max(0, (parsed ?? 0) + dir * stepFor(line.unit))) });
  const price = line.priceRs !== null ? `Receipt: Rs ${trim(line.priceRs)}` : '';
  const showCheck = !line.on && reason !== null;

  return (
    <li className={`snapline${line.on ? '' : ' snapline--off'}`}>
      <div className="snapline__head">
        <label className="snapline__on">
          <input
            type="checkbox"
            checked={line.on}
            disabled={!valid && !line.on}
            aria-label={`Include ${line.label}`}
            onChange={e => onChange(line.key, { type: 'on', on: e.target.checked })}
          />
          <span>{mode === 'pantry' ? 'Set amount' : 'Add'}</span>
        </label>
        <p className="snapline__read">Read: <strong>{line.label}</strong></p>
      </div>

      <div className="snapchips">
        {line.unsure && <span className="snapchip snapchip--unsure">Not sure</span>}
        {showCheck && <span className="snapchip snapchip--check">Check this</span>}
        {line.seenIn.length > 1 && <span className="snapchip snapchip--both">{line.seenIn.length === 2 ? 'Seen in both photos' : `Seen in ${line.seenIn.length} photos`}</span>}
        {price && <span className="snapchip snapchip--price">{price}</span>}
      </div>
      {showCheck && <p className="snapline__reason">{reason}</p>}
      {line.packageNote && <p className="snapline__pkg">{line.packageNote}{mode === 'pantry' ? ' (that is the pack size, not what is left)' : ''}</p>}

      <div className="snapline__match">
        {ing && !picking && (
          <>
            <p className="snapline__ing">{ing.name}{line.newIngredient ? ' (new)' : ''}</p>
            <button type="button" className="button-tint" onClick={() => setPicking(true)}>Change</button>
          </>
        )}
        {!ing && !picking && (
          <button type="button" className="button-tint snapline__pick" onClick={() => setPicking(true)}>Pick which of yours this is</button>
        )}
        {picking && (
          <IngredientPicker
            ingredients={p.ingredients}
            startName={line.label}
            defaultDimension={dimensionFor(line.unit)}
            onPick={i => { setPicking(false); onChange(line.key, { type: 'ingredient', ingredient: i, isNew: false }); }}
            onNew={(name, dimension) => { setPicking(false); p.onCreate(line.key, name, dimension); }}
            onCancel={() => setPicking(false)}
          />
        )}
      </div>

      {ing && (
        <div className="snapline__qty">
          <p className="snapline__ask">{mode === 'pantry' ? 'How much is left?' : 'How much was bought?'}</p>
          <div className="snapstep">
            <button type="button" aria-label={`Less ${line.label}`} onClick={() => nudge(-1)}>−</button>
            <input
              className="snapstep__input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={`Amount of ${line.label}`}
              placeholder="0"
              value={line.amount}
              onChange={e => onChange(line.key, { type: 'quantity', amount: e.target.value })}
            />
            <button type="button" aria-label={`More ${line.label}`} onClick={() => nudge(1)}>+</button>
            <select
              className="snapstep__unit"
              aria-label={`Unit for ${line.label}`}
              value={unitKnown ? (normaliseUnit(line.unit) ?? line.unit) : ''}
              onChange={e => onChange(line.key, { type: 'quantity', unit: e.target.value })}
            >
              {!unitKnown && <option value="" disabled>Choose unit</option>}
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="snapchips" role="group" aria-label="Quick amounts">
            {chips.map(c => (
              <button key={`${c.amount} ${c.unit}`} type="button" className="psheet__chip" onClick={() => onChange(line.key, { type: 'quantity', amount: String(c.amount), unit: c.unit })}>
                {c.amount} {c.unit}
              </button>
            ))}
          </div>
        </div>
      )}

      {ing && preview && (
        <p className="snapline__after" aria-label={`Stock of ${ing.name}`}>
          {preview.before === null ? 'not sure' : p.format(preview.before, ing)}
          {' → '}
          <strong>{preview.after === null ? 'not sure' : p.format(preview.after, ing)}</strong>
          {line.basis === 'estimate' && ' (estimate)'}
        </p>
      )}
    </li>
  );
}

export function PhotoReview(p: PhotoReviewProps) {
  const { draft } = p;
  const total = draft.lines.length;
  const n = includedLines(draft, p.ingredients).length;
  const purchase = draft.mode === 'purchase';
  return (
    <div className="screen form-screen snapreview">
      <h1 className="title title--sm">{purchase ? 'Check what I read' : 'Check your pantry photo'}</h1>
      <p className="eyebrow">Nothing is saved until you tap Save. Fix anything that looks wrong, and switch on only the lines you trust.</p>
      {p.notice && <p className="snapnote" role="status">{p.notice}</p>}
      {draft.notes.map(t => <p key={t} className="snapnote">Gemini says: {t}</p>)}
      <ul className="snaplines">
        {draft.lines.map(line => (
          <ReviewLine key={line.key} line={line} draft={draft} ingredients={p.ingredients} stock={p.stock} format={p.format} onChange={p.onChange} onCreate={p.onCreate} />
        ))}
      </ul>
      <p className="snapcount" role="status">{n} of {total} {total === 1 ? 'line is' : 'lines are'} on</p>
      {p.error && <p className="psheet__error" role="alert">{p.error}</p>}
      <div className="snapactions">
        <button type="button" className="button-primary snapsave" disabled={p.saving || n === 0} onClick={p.onSave}>
          {p.saving ? 'Saving...' : purchase ? `Save ${n} ${n === 1 ? 'item' : 'items'} to pantry` : `Save ${n} remaining ${n === 1 ? 'amount' : 'amounts'}`}
        </button>
        <button type="button" className="button-tint" disabled={p.saving} onClick={p.onAddPhoto}>Add another photo</button>
        <button type="button" className="button-outline" disabled={p.saving} onClick={p.onDiscard}>Discard</button>
      </div>
    </div>
  );
}
