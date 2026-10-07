// Add a new dish by name (F78, F80). The flow: type the name; see what she already has FIRST
// (never a silent duplicate); otherwise look online, choose one of up to five recipes found,
// check the recipe and her stock, then save it as a NEW personal recipe. Gemini only drafts:
// nothing is saved until Noor taps Save. With no key, offline or any error, she is told in
// plain words and the other ways of adding things stay open.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findHouseholdMatches, type HouseholdMatch, type MatchKind } from '../domain/dishMatch';
import type { Balance } from '../domain/ledger';
import type { Availability } from '../domain/suggest';
import type { Ingredient, Recipe } from '../domain/types';
import { extractRecipe, searchDishes } from '../gemini/dish';
import type { DishCandidate, RecipeDraft } from '../gemini/drafts';
import { isGeminiError, plainMessage } from '../gemini/errors';
import { useGemini } from '../gemini/GeminiContext';
import { DishCandidates } from './DishCandidates';
import { DishReview } from './DishReview';

export interface AddDishScreenProps {
  recipes: Recipe[];
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  /** Household-local date, YYYY-MM-DD: the "checked" date on what is found. */
  today: string;
  defaultServings: number;
  yesWord: string;
  noWord: string;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onBack: () => void;
  onOpenRecipe: (recipeId: string) => void;
  onOpenSettings: () => void;
  onAddMissing: (availability: Availability, newIngredients: Ingredient[], dishName: string) => void;
  onSave: (recipe: Recipe, newIngredients: Ingredient[]) => void;
}

type Stage =
  | { name: 'name' }
  | { name: 'household'; matches: HouseholdMatch[] }
  | { name: 'searching' }
  | { name: 'candidates'; list: DishCandidate[] }
  | { name: 'empty' }
  | { name: 'reading'; candidate: DishCandidate }
  | { name: 'review'; candidate: DishCandidate; draft: RecipeDraft }
  | { name: 'problem'; error: unknown; retry: (() => void) | null };

const KIND_LABEL: Record<MatchKind, string> = { exact: 'Same dish', alias: 'Also called this', near: 'Close spelling' };

export function AddDishScreen(p: AddDishScreenProps) {
  // The add-a-dish lookup is always Gemini: Command Code has no Google-grounded search (K1NB38).
  const { dishClient: client, hasGeminiKey: hasKey } = useGemini();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<Stage>({ name: 'name' });
  const [found, setFound] = useState<DishCandidate[]>([]); // kept so Back from a recipe does not search again
  const nameBox = useRef<HTMLInputElement>(null);
  const token = useRef(0); // a newer action makes an older answer stale
  useEffect(() => () => { token.current += 1; }, []);

  const typed = query.trim().replace(/\s+/g, ' ');

  function search(e?: FormEvent) {
    e?.preventDefault();
    if (!typed) return;
    const matches = findHouseholdMatches(typed, p.recipes);
    if (matches.length > 0) { token.current += 1; setStage({ name: 'household', matches }); return; }
    void lookOnline();
  }

  async function lookOnline() {
    const mine = ++token.current;
    if (!hasKey) { setStage({ name: 'problem', error: noKey(), retry: null }); return; }
    setStage({ name: 'searching' });
    try {
      const list = await searchDishes(client, typed, p.today);
      if (mine !== token.current) return;
      setFound(list);
      setStage(list.length ? { name: 'candidates', list } : { name: 'empty' });
    } catch (error) {
      if (mine !== token.current) return;
      setStage({ name: 'problem', error, retry: () => void lookOnline() });
    }
  }

  async function choose(candidate: DishCandidate) {
    const mine = ++token.current;
    setStage({ name: 'reading', candidate });
    try {
      const draft = await extractRecipe(client, candidate, p.defaultServings);
      if (mine !== token.current) return;
      setStage({ name: 'review', candidate, draft });
    } catch (error) {
      if (mine !== token.current) return;
      setStage({ name: 'problem', error, retry: () => void choose(candidate) });
    }
  }

  function back() {
    token.current += 1;
    if (stage.name === 'review' || stage.name === 'reading') {
      setStage(found.length ? { name: 'candidates', list: found } : { name: 'name' });
      return;
    }
    if (stage.name === 'name') p.onBack();
    else setStage({ name: 'name' });
  }

  if (stage.name === 'review') {
    return (
      <DishReview
        typedName={typed}
        draft={stage.draft}
        sourceName={stage.candidate.sourceName}
        candidateTitle={stage.candidate.title}
        ingredients={p.ingredients}
        stock={p.stock}
        defaultServings={p.defaultServings}
        format={p.format}
        onBack={back}
        onAddMissing={p.onAddMissing}
        onSave={p.onSave}
      />
    );
  }

  const busy = stage.name === 'searching' || stage.name === 'reading';
  const showForm = stage.name === 'name' || stage.name === 'household' || stage.name === 'empty' || stage.name === 'problem';

  return (
    <div className="screen form-screen adddish">
      <div className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={back}>‹</button>
        <h1 className="title title--sm">Add a new dish</h1>
      </div>

      {showForm && (
        <form className="adddish__form" onSubmit={search}>
          <label className="adddish__field">
            <span className="adddish__label">What is the dish called?</span>
            <input
              className="input adddish__name"
              ref={nameBox}
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              maxLength={80}
              placeholder="For example: haleem, korma, karela"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <button type="submit" className="button-primary adddish__search" disabled={!typed}>Search</button>
        </form>
      )}

      {stage.name === 'household' && (
        <section className="adddish__section" aria-label="You already have these">
          <h2 className="section__title">You already have these</h2>
          <ul className="rows">
            {stage.matches.map(({ recipe, kind }) => (
              <li key={recipe.id} className="row">
                <div className="row__main">
                  <span className="row__name">{recipe.name}</span>
                  <span className="recipes__meta">{KIND_LABEL[kind]}{recipe.category ? ` · ${recipe.category}` : ''}</span>
                </div>
                <button type="button" className="button-tint" aria-label={`Open ${recipe.name}`} onClick={() => p.onOpenRecipe(recipe.id)}>Open</button>
              </li>
            ))}
          </ul>
          <p className="adddish__hint">Not the one you mean?</p>
          <button type="button" className="button-outline adddish__wide" onClick={() => void lookOnline()}>
            {p.noWord}, look online instead
          </button>
        </section>
      )}

      {busy && (
        <div className="adddish__loading" role="status" aria-live="polite">
          <span className="adddish__spinner" aria-hidden="true" />
          <div>
            <div className="adddish__loading-title">
              {stage.name === 'searching' ? `Looking up "${typed}"...` : 'Reading the recipe...'}
            </div>
            <div className="adddish__hint">This can take up to half a minute.</div>
          </div>
        </div>
      )}

      {stage.name === 'candidates' && (
        <DishCandidates
          query={typed}
          candidates={stage.list}
          yesWord={p.yesWord}
          onChoose={c => void choose(c)}
          onSearchAgain={() => setStage({ name: 'name' })}
        />
      )}

      {stage.name === 'empty' && (
        <div className="status status--maybe" role="status">
          Nothing found for "{typed}". Try another spelling, for example "kurma" or "qorma", then Search again.
        </div>
      )}

      {stage.name === 'problem' && <Problem error={stage.error} retry={stage.retry} onSettings={p.onOpenSettings} onBack={p.onBack} onRespell={() => nameBox.current?.focus()} />}
    </div>
  );
}

const noKey = () => Object.assign(new Error('no key'), { code: 'no-key' });

function Problem(p: { error: unknown; retry: (() => void) | null; onSettings: () => void; onBack: () => void; onRespell: () => void }) {
  const code = isGeminiError(p.error) ? p.error.code : (p.error as { code?: string })?.code;
  const needsKey = code === 'no-key' || code === 'bad-key';
  const message = code === 'no-key' ? 'Add your Gemini key in Settings to look dishes up online.' : plainMessage(p.error);
  const retryable = isGeminiError(p.error) && p.error.retryable;
  return (
    <div className="adddish__problem" role="alert">
      <p className="adddish__problem-text">{message}</p>
      <div className="adddish__chips">
        {needsKey && <button type="button" className="button-primary adddish__small" onClick={p.onSettings}>Open Settings</button>}
        {retryable && p.retry && <button type="button" className="button-primary adddish__small" onClick={p.retry}>Try again</button>}
        <button type="button" className="button-outline adddish__small" onClick={p.onRespell}>Search again with a different spelling</button>
        <button type="button" className="button-outline adddish__small" onClick={p.onBack}>Back to recipes</button>
      </div>
      <p className="adddish__hint">You can still cook from the recipes you have.</p>
    </div>
  );
}
