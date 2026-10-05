// Check a recipe found online before it becomes hers (F80). Every ingredient line is matched
// to one of her ingredients (or made a new one), amounts are hers to correct, and the stock
// check recomputes as she edits. Saving is blocked while any included line is unresolved.
import { useMemo, useState } from 'react';
import type { Balance } from '../domain/ledger';
import {
  buildDish, dishAliases, draftLines, newIngredientId, newRecipeId, searchIngredients, stockSummary, suggestIngredients,
  type DraftLine, type LineProblem, type NewIngredientSpec,
} from '../domain/dishDraft';
import { availability, type Availability } from '../domain/suggest';
import type { Dimension, Ingredient, Recipe } from '../domain/types';
import { KNOWN_UNITS, toBase } from '../domain/units';
import { videoFor } from '../gemini/dish';
import type { RecipeDraft } from '../gemini/drafts';
import { shortDate } from './DishCandidates';

export interface DishReviewProps {
  /** What Noor typed; kept as an alias so the dish is found by that name next time. */
  typedName: string;
  draft: RecipeDraft;
  sourceName: string;
  candidateTitle: string;
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  defaultServings: number;
  /** Base units to a friendly amount, e.g. 1500 -> "1.5 kg". */
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onBack: () => void;
  onAddMissing: (availability: Availability, newIngredients: Ingredient[], dishName: string) => void;
  onSave: (recipe: Recipe, newIngredients: Ingredient[]) => void;
}

const measureFor = (unit: string): Dimension =>
  ['g', 'kg'].includes(unit) ? 'mass' : ['ml', 'L', 'tsp', 'tbsp', 'cup'].includes(unit) ? 'volume' : 'count';
const MEASURES: { id: Dimension; label: string }[] = [
  { id: 'mass', label: 'Weight (g, kg)' },
  { id: 'volume', label: 'Volume (ml, L)' },
  { id: 'count', label: 'Pieces' },
];

export function DishReview(p: DishReviewProps) {
  const [lines, setLines] = useState<DraftLine[]>(() => draftLines(p.draft, p.ingredients));
  const [name, setName] = useState(p.draft.title);
  const [serves, setServes] = useState(p.draft.serves);
  const [cookFor, setCookFor] = useState(p.defaultServings);
  const [recipeId] = useState(() => newRecipeId());

  const built = useMemo(
    () => buildDish(lines, p.ingredients, {
      id: recipeId, name, serves, time: p.draft.time, steps: p.draft.steps,
      aliases: dishAliases(p.typedName, p.candidateTitle),
      source: { url: p.draft.sourceUrl, name: p.sourceName, checkedOn: p.draft.checkedOn },
      videoUrl: p.draft.videoUrl,
    }),
    [lines, p.ingredients, recipeId, name, serves, p.draft, p.typedName, p.candidateTitle, p.sourceName],
  );
  const avail = useMemo(
    () => availability(built.recipe, cookFor, p.stock, built.ingredientsById, toBase),
    [built, cookFor, p.stock],
  );
  const summary = stockSummary(avail);
  const aisles = useMemo(() => [...new Set([...p.ingredients.map(i => i.aisle), 'Other'])], [p.ingredients]);
  const takenIds = useMemo(() => [...built.ingredientsById.keys()], [built]);
  const video = videoFor({ videoUrl: p.draft.videoUrl, title: name });

  const patch = (key: string, change: Partial<DraftLine>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...change } : l)));

  const nameOf = (id: string) => built.ingredientsById.get(id)?.name ?? id;
  const missing = summary.short.map(s => {
    const ing = built.ingredientsById.get(s.ingredientId);
    return ing ? `${ing.name} (${p.format(s.amount, ing)} more)` : s.ingredientId;
  });
  const hasMissing = summary.short.length + summary.unsure.length > 0;
  const stockClass =
    summary.total === 0 ? 'status status--maybe'
    : summary.short.length ? 'status status--short'
    : summary.unsure.length ? 'status status--maybe'
    : 'status status--good';

  const blockedReason =
    built.flagged > 0 ? `Fix ${built.flagged} ${built.flagged === 1 ? 'line' : 'lines'} first`
    : built.recipe.ingredients.length === 0 ? 'Keep at least one ingredient'
    : !name.trim() ? 'Give the dish a name'
    : '';

  function addMissing() {
    const needed = new Set(avail.needs.filter(n => !n.optional && n.status !== 'enough').map(n => n.ingredientId));
    p.onAddMissing(avail, built.newIngredients.filter(i => needed.has(i.id)), built.recipe.name);
  }

  return (
    <div className="screen form-screen adddish adddish--review">
      <div className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <h1 className="title title--sm">Check the recipe</h1>
      </div>

      <p className="adddish__hint">
        Found online, so please check it. It becomes yours only when you save it.
      </p>

      <label className="adddish__field">
        <span className="adddish__label">Recipe name</span>
        <input className="input" value={name} maxLength={100} onChange={e => setName(e.target.value)} />
      </label>

      <div className="adddish__source">
        From <a href={p.draft.sourceUrl} target="_blank" rel="noreferrer">{p.sourceName}</a> · checked {shortDate(p.draft.checkedOn)}
        {p.draft.time ? ` · ${p.draft.time}` : ''}
      </div>

      <div className="stepper-row">
        <span className="stepper-row__label">This recipe makes</span>
        <div className="stepper">
          <button type="button" aria-label="Recipe makes fewer" onClick={() => setServes(s => Math.max(1, s - 1))}>−</button>
          <output aria-live="polite" aria-label="Recipe makes">{serves}</output>
          <button type="button" aria-label="Recipe makes more" onClick={() => setServes(s => Math.min(30, s + 1))}>+</button>
        </div>
      </div>

      <section className="adddish__stock" aria-label="Stock check">
        <div className="stepper-row">
          <span className="stepper-row__label">Cooking for</span>
          <div className="stepper">
            <button type="button" aria-label="Fewer people" onClick={() => setCookFor(s => Math.max(1, s - 1))}>−</button>
            <output aria-live="polite" aria-label="Cooking for">{cookFor}</output>
            <button type="button" aria-label="More people" onClick={() => setCookFor(s => Math.min(30, s + 1))}>+</button>
          </div>
        </div>
        <div className={stockClass} role="status">
          {summary.total === 0
            ? 'Fix the ingredient lines below to check your stock.'
            : `You have ${summary.have} of ${summary.total} ingredients for ${cookFor}`}
          {built.flagged > 0 && summary.total > 0 ? ` (${built.flagged} ${built.flagged === 1 ? 'line needs' : 'lines need'} you)` : ''}
        </div>
        {missing.length > 0 && <p className="adddish__missing">Missing: {missing.join(', ')}</p>}
        {summary.unsure.length > 0 && <p className="adddish__missing adddish__missing--check">Check the shelf: {summary.unsure.map(nameOf).join(', ')}</p>}
      </section>

      <h2 className="section__title">Ingredients</h2>
      <ul className="adddish-lines">
        {lines.map(line => (
          <LineRow
            key={line.key}
            line={line}
            problem={built.problems.get(line.key) ?? null}
            matchedName={line.match ? (line.match.kind === 'have' ? nameOf(line.match.ingredientId) : line.match.spec.name) : null}
            ingredients={p.ingredients}
            aisles={aisles}
            takenIds={takenIds}
            onPatch={change => patch(line.key, change)}
          />
        ))}
      </ul>

      {p.draft.steps.length > 0 && (
        <>
          <h2 className="section__title">Steps (short version)</h2>
          <ol className="adddish__steps">
            {p.draft.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="adddish__hint">Written briefly in other words. The full method is on the source page.</p>
        </>
      )}

      <div className="action-bar adddish__bar">
        {blockedReason && <p className="action-bar__hint" role="status">{blockedReason}</p>}
        <button
          type="button"
          className="button-save adddish__save"
          disabled={Boolean(blockedReason)}
          onClick={() => p.onSave(built.recipe, built.newIngredients)}
        >
          Save to my recipes
        </button>
        <div className="adddish__bar-row">
          <a className="adddish-link" href={video.url} target="_blank" rel="noreferrer">
            {video.confirmed ? '▶ Watch video' : 'Watch video · YouTube search'}
          </a>
          <button type="button" className="button-outline" disabled={!hasMissing} onClick={addMissing}>Add missing to list</button>
        </div>
      </div>
    </div>
  );
}

interface LineRowProps {
  line: DraftLine;
  problem: LineProblem | null;
  matchedName: string | null;
  ingredients: Ingredient[];
  aisles: string[];
  takenIds: string[];
  onPatch: (change: Partial<DraftLine>) => void;
}

// Defined at module level (never inside DishReview) so typing in a box never remounts it.
function LineRow(p: LineRowProps) {
  const { line, problem } = p;
  const [mode, setMode] = useState<'none' | 'pick' | 'new'>('none');
  const suggestions = useMemo(() => suggestIngredients(line.name, p.ingredients, 3), [line.name, p.ingredients]);

  if (!line.included) {
    return (
      <li className="adddish-line adddish-line--out">
        <span className="adddish-line__name">{line.name}</span>
        <span className="adddish-line__left-out">left out</span>
        <button type="button" className="button-tint" aria-label={`Put back ${line.name}`} onClick={() => p.onPatch({ included: true })}>Put back</button>
      </li>
    );
  }

  const choose = (match: DraftLine['match']) => { p.onPatch({ match, auto: false }); setMode('none'); };
  const unmatched = !line.match;

  return (
    <li className={problem ? 'adddish-line adddish-line--flagged' : 'adddish-line'}>
      <div className="adddish-line__top">
        <span className="adddish-line__name">{line.name}</span>
        <button type="button" className="link-button" aria-label={`Leave out ${line.name}`} onClick={() => p.onPatch({ included: false })}>Leave out</button>
      </div>

      {unmatched && mode === 'none' && (
        <div className="adddish-line__which">
          <p className="adddish-line__question">Which of yours is this?</p>
          <div className="adddish__chips">
            {suggestions.map(s => (
              <button key={s.id} type="button" className="choice-chip" aria-label={`Use ${s.name} for ${line.name}`}
                onClick={() => choose({ kind: 'have', ingredientId: s.id })}>{s.name}</button>
            ))}
            <button type="button" className="choice-chip" aria-label={`Search my ingredients for ${line.name}`} onClick={() => setMode('pick')}>Search mine</button>
            <button type="button" className="choice-chip" aria-label={`New ingredient for ${line.name}`} onClick={() => setMode('new')}>New ingredient</button>
          </div>
        </div>
      )}

      {!unmatched && mode === 'none' && (
        <div className="adddish-line__matched">
          <span className="adddish-line__tick" aria-hidden="true">✓</span>
          <span>{line.match?.kind === 'new' ? `New ingredient: ${p.matchedName}` : p.matchedName}</span>
          <button type="button" className="link-button" aria-label={`Change ingredient for ${line.name}`} onClick={() => setMode('pick')}>Change</button>
        </div>
      )}

      {mode === 'pick' && (
        <IngredientPicker
          lineName={line.name}
          ingredients={p.ingredients}
          onChoose={id => choose({ kind: 'have', ingredientId: id })}
          onNew={() => setMode('new')}
          onCancel={() => setMode('none')}
        />
      )}
      {mode === 'new' && (
        <NewIngredientForm
          line={line}
          aisles={p.aisles}
          takenIds={p.takenIds}
          onDone={spec => choose({ kind: 'new', spec })}
          onCancel={() => setMode('none')}
        />
      )}

      <div className="adddish-line__amount-row">
        <input
          className="input adddish-line__amount"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Amount for ${line.name}`}
          aria-invalid={problem?.code === 'amount' ? true : undefined}
          value={line.amountText}
          placeholder="amount"
          onChange={e => p.onPatch({ amountText: e.target.value })}
        />
        <select
          className="input adddish-line__unit"
          aria-label={`Unit for ${line.name}`}
          aria-invalid={problem?.code === 'unit' ? true : undefined}
          value={line.unit}
          onChange={e => p.onPatch({ unit: e.target.value })}
        >
          <option value="">no unit</option>
          {KNOWN_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <button type="button" className="choice-chip" aria-pressed={line.optional} aria-label={`${line.name} is optional`}
          onClick={() => p.onPatch({ optional: !line.optional })}>Optional</button>
      </div>

      {problem && problem.code !== 'unmatched' && (
        <p className="adddish-line__problem" role="alert">
          {problem.message}
          {problem.code === 'unit' ? ': pick a unit that fits this ingredient (g, kg, ml, L, pc)' : ''}
        </p>
      )}
    </li>
  );
}

function IngredientPicker(p: {
  lineName: string;
  ingredients: Ingredient[];
  onChoose: (id: string) => void;
  onNew: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const results = useMemo(() => searchIngredients(text, p.ingredients, 8), [text, p.ingredients]);
  return (
    <div className="adddish-picker">
      <input
        className="input"
        type="search"
        autoFocus
        autoComplete="off"
        aria-label="Search your ingredients"
        placeholder="Type to search your ingredients"
        value={text}
        onChange={e => setText(e.target.value)}
      />
      {results.length === 0 ? (
        <p className="adddish__hint">None of yours match "{text}".</p>
      ) : (
        <ul className="adddish-picker__list">
          {results.map(i => (
            <li key={i.id}>
              <button type="button" className="adddish-picker__item" aria-label={`Pick ${i.name} for ${p.lineName}`} onClick={() => p.onChoose(i.id)}>
                {i.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="adddish__chips">
        <button type="button" className="choice-chip" onClick={p.onNew}>New ingredient</button>
        <button type="button" className="choice-chip" onClick={p.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function NewIngredientForm(p: {
  line: DraftLine;
  aisles: string[];
  takenIds: string[];
  onDone: (spec: NewIngredientSpec) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(p.line.name.slice(0, 80));
  const [measure, setMeasure] = useState<Dimension>(measureFor(p.line.unit));
  const [aisle, setAisle] = useState(p.aisles.includes('Pantry/Dry Goods') ? 'Pantry/Dry Goods' : p.aisles[0] ?? 'Other');
  const clean = name.trim().replace(/\s+/g, ' ');
  return (
    <div className="adddish-picker adddish-new">
      <label className="adddish__field">
        <span className="adddish__label">New ingredient name</span>
        <input className="input" autoFocus value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      </label>
      <div role="group" aria-label="Measured by">
        <span className="adddish__label">Measured by</span>
        <div className="adddish__chips">
          {MEASURES.map(m => (
            <button key={m.id} type="button" className="choice-chip" aria-pressed={measure === m.id} onClick={() => setMeasure(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Aisle">
        <span className="adddish__label">Where you buy it</span>
        <div className="adddish__chips">
          {p.aisles.map(a => (
            <button key={a} type="button" className="choice-chip" aria-pressed={aisle === a} onClick={() => setAisle(a)}>{a}</button>
          ))}
        </div>
      </div>
      <div className="adddish__chips">
        <button type="button" className="button-tint" disabled={!clean}
          onClick={() => p.onDone({ id: newIngredientId(clean, p.takenIds), name: clean, measure, aisle })}>Add as new ingredient</button>
        <button type="button" className="choice-chip" onClick={p.onCancel}>Cancel</button>
      </div>
    </div>
  );
}
