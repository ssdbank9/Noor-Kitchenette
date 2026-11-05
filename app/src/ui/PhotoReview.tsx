// Snap pantry review (F28-F30, F52, F53, F57, F73): one card per item the reader found.
// Nothing here changes stock; Noor answers each card's question, and ready cards collapse to
// quiet rows. Save writes the ONE event built from the ready lines (domain/photoDraft.ts).
//
// Design rules (real-phone review, 2026-10-07): no checkboxes, no status chips, no jargon.
// A line is saved because it is answered, not because a box was ticked. Every card shows the
// small crop stored on the line at read time — it survives reloads with the draft; full
// photos are never kept (D-20).
import { useState } from 'react';
import type { Balance } from '../domain/ledger';
import {
  checkLine,
  ingredientOf,
  includedLines,
  previewLine,
  rankIngredients,
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
  /** The household's yes word, e.g. "Haan". */
  yesWord: string;
  /** Who read the photo, for the note label ("Command Code says: ..."). */
  readerName: string;
  /** Shown above the lines, e.g. that another photo is waiting. */
  notice?: string;
  onChange: (key: string, patch: LinePatch) => void;
  /** Noor made a new ingredient for this line. */
  onCreate: (key: string, name: string, dimension: Dimension) => void;
  onSave: () => void;
  /** Back arrow: leave the review (keep-or-throw-away is asked by the parent). */
  onBack: () => void;
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

/** The item's own little picture, cut from the photo at read time and stored on the line. */
function Thumb(p: { line: DraftLine }) {
  if (!p.line.thumb) return null;
  return <img className="snapcard__thumb" src={p.line.thumb} alt={`Photo of ${p.line.label}`} />;
}

/** Search box + list, ranked against what the reader saw. Module-level so focus stays put. */
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
  const base = q ? p.ingredients : rankIngredients(p.startName, p.ingredients, p.ingredients.length);
  const matches = base
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

function ReviewCard(p: {
  line: DraftLine;
  draft: Draft;
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: PhotoReviewProps['format'];
  yesWord: string;
  onChange: PhotoReviewProps['onChange'];
  onCreate: PhotoReviewProps['onCreate'];
}) {
  const { line, draft, onChange } = p;
  const [picking, setPicking] = useState(false);
  /** A ready card opens for edits without leaving the save set. */
  const [open, setOpen] = useState(false);
  const ing = ingredientOf(line, p.ingredients);
  const mode = draft.mode;
  const check = checkLine(line, ing, mode);
  const ready = line.on && check.ok;
  const preview = previewLine(line, ing, mode, ing ? p.stock.get(ing.id) : undefined);
  const chips = ing ? quickAmounts(ing) : [];
  const units = unitOptions(ing);
  const unitKnown = units.includes(normaliseUnit(line.unit) ?? line.unit);
  const parsed = parseAmountText(line.amount);
  const nudge = (dir: 1 | -1) => onChange(line.key, { type: 'quantity', amount: trim(Math.max(0, (parsed ?? 0) + dir * stepFor(line.unit))) });
  const guesses = draft.guesses?.[line.key] ?? [];
  const ranked = ing ? [] : rankIngredients(line.label, p.ingredients);
  // Ranked household matches first, then model guesses that are not already shown.
  const guessOnly = guesses.filter(g => !ranked.some(r => r.name.toLowerCase() === g.toLowerCase()));
  const guessAsIngredient = (name: string) =>
    p.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase() || i.aliases.some(a => a.toLowerCase() === name.toLowerCase()));

  const amountRow = ing && (
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
      {chips.length > 0 && (
        <div className="snapchips" role="group" aria-label="Quick amounts">
          {chips.map(c => (
            <button key={`${c.amount} ${c.unit}`} type="button" className="psheet__chip" onClick={() => onChange(line.key, { type: 'quantity', amount: String(c.amount), unit: c.unit })}>
              {c.amount} {c.unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (ready && !open) {
    return (
      <li className="snapcard snapcard--ready">
        <Thumb line={line} />
        <p className="snapcard__summary">
          <strong>{ing!.name}</strong>{line.newIngredient ? ' (new)' : ''} — {line.amount} {line.unit}
          {line.priceRs !== null && <span> · Rs {trim(line.priceRs)}</span>}
          {line.seenIn.length > 1 && <span> · in both photos</span>}
          {preview && (
            <span className="snapcard__after" aria-label={`Stock of ${ing!.name}`}>
              {' · '}{preview.before === null ? 'not sure' : p.format(preview.before, ing!)} → {preview.after === null ? 'not sure' : p.format(preview.after, ing!)}
            </span>
          )}
        </p>
        <span className="snapcard__tick" aria-hidden="true">✓</span>
        <button type="button" className="snapcard__edit" aria-label={`Change ${ing!.name}`} onClick={() => setOpen(true)}>Change</button>
        <button type="button" className="snapcard__not" aria-label={`Not this: ${line.label}`} onClick={() => onChange(line.key, { type: 'removed', removed: true })}>✕</button>
      </li>
    );
  }

  if (ready && open) {
    return (
      <li className="snapcard">
        <div className="snapcard__head">
          <Thumb line={line} />
          <p className="snapcard__read"><strong>{ing!.name}</strong></p>
          <button type="button" className="snapcard__not" aria-label={`Not this: ${line.label}`} onClick={() => onChange(line.key, { type: 'removed', removed: true })}>✕</button>
        </div>
        {amountRow}
        <div className="snaprow">
          <button type="button" className="button-outline" onClick={() => setPicking(true)}>Different thing</button>
          <button type="button" className="button-primary" onClick={() => setOpen(false)}>Done</button>
        </div>
        {picking && (
          <IngredientPicker
            ingredients={p.ingredients}
            startName={ing!.name}
            defaultDimension={dimensionFor(line.unit)}
            onPick={i => { setPicking(false); setOpen(false); onChange(line.key, { type: 'ingredient', ingredient: i, isNew: false }); }}
            onNew={(name, dimension) => { setPicking(false); setOpen(false); p.onCreate(line.key, name, dimension); }}
            onCancel={() => setPicking(false)}
          />
        )}
      </li>
    );
  }

  return (
    <li className="snapcard">
      <div className="snapcard__head">
        <Thumb line={line} />
        <p className="snapcard__read">I saw: <strong>{line.label}</strong></p>
        <button type="button" className="snapcard__not" aria-label={`Not this: ${line.label}`} onClick={() => onChange(line.key, { type: 'removed', removed: true })}>✕</button>
      </div>

      {line.unsure && <p className="snapcard__unsure">I wasn't sure about this one — please check it.</p>}
      {line.packageNote && <p className="snapline__pkg">The pack says {line.packageNote.replace('Package says ', '')}{mode === 'pantry' ? ' — that is the pack size, not what is left' : ''}.</p>}
      {line.priceRs !== null && <p className="snapline__pkg">Price on the receipt: Rs {trim(line.priceRs)}</p>}
      {line.seenIn.length > 1 && <p className="snapline__pkg">In both photos.</p>}

      {picking ? (
        <IngredientPicker
          ingredients={p.ingredients}
          startName={line.label}
          defaultDimension={dimensionFor(line.unit)}
          onPick={i => { setPicking(false); onChange(line.key, { type: 'ingredient', ingredient: i, isNew: false }); }}
          onNew={(name, dimension) => { setPicking(false); p.onCreate(line.key, name, dimension); }}
          onCancel={() => setPicking(false)}
        />
      ) : !ing ? (
        <>
          <p className="snapcard__question">Which of your things is this?</p>
          <div className="snapcard__choices">
            {ranked.map(i => (
              <button key={i.id} type="button" className="choice-chip" onClick={() => onChange(line.key, { type: 'ingredient', ingredient: i, isNew: false })}>{i.name}</button>
            ))}
            {guessOnly.map(name => {
              const existing = guessAsIngredient(name);
              return (
                <button key={name} type="button" className="choice-chip choice-chip--guess"
                  onClick={() => existing ? onChange(line.key, { type: 'ingredient', ingredient: existing, isNew: false }) : p.onCreate(line.key, name, dimensionFor(line.unit))}>
                  {name}
                </button>
              );
            })}
          </div>
          <div className="snaprow">
            <button type="button" className="button-tint" onClick={() => p.onCreate(line.key, line.label, dimensionFor(line.unit))}>It's something new</button>
            <button type="button" className="button-outline" onClick={() => setPicking(true)}>Search all</button>
          </div>
        </>
      ) : (
        <>
          {line.unsure && (
            <>
              <p className="snapcard__question">Is this your <strong>{ing.name}</strong>{line.newIngredient ? ' (new)' : ''}?</p>
              <div className="snapcard__confirm">
                <button type="button" className="answer answer--yes" onClick={() => onChange(line.key, { type: 'sure' })}>{p.yesWord}</button>
                <button type="button" className="button-outline" onClick={() => setPicking(true)}>No, change</button>
              </div>
            </>
          )}
          {amountRow}
          <div className="snaprow">
            <button type="button" className="button-outline" onClick={() => setPicking(true)}>Different thing</button>
          </div>
        </>
      )}

      {!ing && <p className="snapcard__hint">The amount comes after you say what it is.</p>}
    </li>
  );
}

export function PhotoReview(p: PhotoReviewProps) {
  const { draft } = p;
  const active = draft.lines.filter(l => !l.removed);
  const removed = draft.lines.filter(l => l.removed);
  const n = includedLines(draft, p.ingredients).length;
  const purchase = draft.mode === 'purchase';
  return (
    <div className="screen form-screen snapreview">
      <header className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <h1 className="title title--sm">{purchase ? 'Check what I read' : 'Check your pantry photo'}</h1>
      </header>
      <p className="eyebrow">Tell me what each thing is and how much there is. Nothing is saved until you tap Save.</p>
      {p.notice && <p className="snapnote" role="status">{p.notice}</p>}
      {draft.notes.map(t => <p key={t} className="snapnote">{p.readerName} says: {t}</p>)}
      <ul className="snaplines">
        {active.map(line => (
          <ReviewCard key={line.key} line={line} draft={draft} ingredients={p.ingredients} stock={p.stock} format={p.format} yesWord={p.yesWord} onChange={p.onChange} onCreate={p.onCreate} />
        ))}
      </ul>
      {removed.length > 0 && (
        <section className="snapremoved" aria-label="Not saving these">
          <h2 className="snapremoved__title">Not saving these ({removed.length})</h2>
          <ul className="snapremoved__list">
            {removed.map(line => (
              <li key={line.key} className="snapremoved__row">
                <span>{line.label}</span>
                <button type="button" className="button-tint" aria-label={`Bring back ${line.label}`} onClick={() => p.onChange(line.key, { type: 'removed', removed: false })}>Bring back</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="snapcount" role="status">{n} of {active.length} ready</p>
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
