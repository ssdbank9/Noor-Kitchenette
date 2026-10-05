// Bottom sheets for the Plan tab (F54, F60): pick a dish, eating out, leftovers, and the
// week's suggestions. Each is a top-level component so typing in a search box never loses focus.
import { useMemo, useState, type ReactNode } from 'react';
import { cleanLabel, SLOT_NAMES, type Proposal } from '../domain/plan';
import { cookableNow, suggestNextMeals } from '../domain/suggest';
import { toBase } from '../domain/units';
import { stillHere } from '../domain/leftovers';
import type { Ingredient, KitchenEvent, Leftover, MealSlot, Recipe } from '../domain/types';

export function Sheet(p: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="psheet" role="dialog" aria-modal="true" aria-label={p.title}
      onKeyDown={e => { if (e.key === 'Escape') p.onClose(); }}>
      <button type="button" className="psheet__backdrop" aria-hidden="true" tabIndex={-1} onClick={p.onClose} />
      <div className="psheet__panel">
        <div className="psheet__head">
          <h2 className="psheet__name">{p.title}</h2>
          <button type="button" className="psheet__close" onClick={p.onClose}>Close</button>
        </div>
        {p.children}
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  ready: { cls: 'badge badge--ready', text: 'Ready' },
  maybe: { cls: 'badge badge--check', text: 'Check stock' },
  missing: { cls: 'badge badge--need', text: 'Need some' },
} as const;

export interface DishSheetProps {
  title: string;
  verb: 'Add' | 'Swap to';
  slot: MealSlot;
  date: string;
  servings: number;
  recipes: Recipe[];
  ingredients: Ingredient[];
  events: KitchenEvent[];
  onPick: (recipe: Recipe) => void;
  onClose: () => void;
}

/** Search for a dish; ready dishes first; the Suggest chip shows the best matches for this slot. */
export function DishSheet(p: DishSheetProps) {
  const [query, setQuery] = useState('');
  const [suggest, setSuggest] = useState(false);
  const ranked = useMemo(
    () => cookableNow(p.recipes, p.servings, p.events, p.ingredients, toBase),
    [p.recipes, p.servings, p.events, p.ingredients],
  );
  const suggestions = useMemo(
    () => suggestNextMeals(p.recipes, p.servings, p.events, p.ingredients, toBase, p.date, new Set(), p.slot).slice(0, 6),
    [p.recipes, p.servings, p.events, p.ingredients, p.date, p.slot],
  );
  const recipesById = useMemo(() => new Map(p.recipes.map(r => [r.id, r])), [p.recipes]);
  const q = query.trim().toLowerCase();
  const matches = (r: Recipe) => !q || [r.name, r.category ?? '', ...(r.aliases ?? [])].some(t => t.toLowerCase().includes(q));
  const rows = suggest && !q
    ? suggestions.map(s => ({ recipe: s.recipe, status: s.availability.status, note: s.reasons[0] }))
    : ranked.filter(a => matches(recipesById.get(a.recipeId)!)).map(a => ({ recipe: recipesById.get(a.recipeId)!, status: a.status, note: recipesById.get(a.recipeId)!.time }));

  return (
    <Sheet title={p.title} onClose={p.onClose}>
      <input
        className="input"
        type="search"
        role="searchbox"
        aria-label="Search dishes"
        placeholder="Search dishes"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="plan-chips" role="group" aria-label="Show">
        <button type="button" className="choice-chip" aria-pressed={suggest} onClick={() => setSuggest(s => !s)}>Suggest</button>
      </div>
      {rows.length === 0 && <p className="empty empty--flush">No dish matches. Try another word.</p>}
      <ul className="rows plan-picks">
        {rows.map(({ recipe, status, note }) => (
          <li key={recipe.id}>
            <button type="button" className="plan-pick" aria-label={`${p.verb} ${recipe.name}`} onClick={() => p.onPick(recipe)}>
              <span className="plan-pick__text">
                <span className="row__name">{recipe.name}</span>
                <span className="row__need">{note}</span>
              </span>
              <span className={STATUS_BADGE[status].cls}>{STATUS_BADGE[status].text}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function EatOutSheet(p: { title: string; onSave: (label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState('');
  return (
    <Sheet title={p.title} onClose={p.onClose}>
      <label className="plan-field">
        <span>Where or what? (optional)</span>
        <input className="input" type="text" maxLength={60} autoFocus value={label} placeholder="For example Kolachi, or pizza"
          onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') p.onSave(cleanLabel(label)); }} />
      </label>
      <p className="plan-note">No cooking is planned for this meal and nothing is taken from your pantry.</p>
      <button type="button" className="button-primary plan-wide" onClick={() => p.onSave(cleanLabel(label))}>We're eating out</button>
    </Sheet>
  );
}

export function LeftoverSheet(p: { title: string; leftovers: Leftover[]; onPick: (l: Leftover, portions: number) => void; onClose: () => void }) {
  const here = stillHere(p.leftovers);
  const [chosen, setChosen] = useState<string | null>(null);
  const [portions, setPortions] = useState(1);
  const pick = here.find(l => l.id === chosen);
  return (
    <Sheet title={p.title} onClose={p.onClose}>
      {here.length === 0 && (
        <p className="empty empty--flush">No leftovers right now. When you keep leftovers after cooking, they show up here.</p>
      )}
      <ul className="rows">
        {here.map(l => (
          <li key={l.id}>
            <button type="button" className="plan-pick" aria-pressed={chosen === l.id} aria-label={`Choose ${l.name}`}
              onClick={() => { setChosen(l.id); setPortions(Math.min(portions, l.portionsLeft) || 1); }}>
              <span className="plan-pick__text">
                <span className="row__name">{l.name}</span>
                <span className="row__need">{l.portionsLeft} {l.portionsLeft === 1 ? 'portion' : 'portions'} left · {l.location}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {pick && (
        <>
          <div className="stepper-row" role="group" aria-label="Portions">
            <span className="stepper-row__label">Portions</span>
            <div className="stepper">
              <button type="button" aria-label="Fewer portions" onClick={() => setPortions(n => Math.max(1, n - 1))}>−</button>
              <output aria-live="polite" aria-label="Portions to eat">{portions}</output>
              <button type="button" aria-label="More portions" onClick={() => setPortions(n => Math.min(pick.portionsLeft, n + 1))}>+</button>
            </div>
          </div>
          <button type="button" className="button-primary plan-wide" onClick={() => p.onPick(pick, portions)}>Add to this meal</button>
        </>
      )}
    </Sheet>
  );
}

const dayLabel = (date: string) => {
  const d = new Date(date + 'T00:00:00Z');
  return `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d)} ${d.getUTCDate()}`;
};

export function WeekSheet(p: {
  propose: (exclude: Map<string, Set<string>>) => Proposal[];
  onUse: (proposal: Proposal) => void;
  onUseAll: (proposals: Proposal[]) => void;
  onClose: () => void;
}) {
  const [rejected, setRejected] = useState<Map<string, Set<string>>>(new Map());
  const proposals = p.propose(rejected); // recalculated each render so it follows the plan
  const reject = (pr: Proposal) =>
    setRejected(prev => {
      const key = `${pr.localDate}|${pr.slot}`;
      const next = new Map(prev);
      next.set(key, new Set([...(prev.get(key) ?? []), pr.recipeId]));
      return next;
    });
  return (
    <Sheet title="Suggestions for your week" onClose={p.onClose}>
      <p className="plan-note">Nothing is planned until you tap Use this or Use all.</p>
      {proposals.length === 0 && <p className="empty empty--flush">Nothing to suggest. Your lunches and dinners for the next 7 days are already planned.</p>}
      <ul className="rows">
        {proposals.map(pr => {
          const where = `${dayLabel(pr.localDate)} ${SLOT_NAMES[pr.slot]}`;
          return (
            <li key={`${pr.localDate}|${pr.slot}`} className="plan-prop">
              <div className="plan-prop__text">
                <span className="plan-prop__when">{where}</span>
                <span className="row__name">{pr.recipeName}</span>
                <span className="row__need">{pr.reasons[0]}</span>
              </div>
              <div className="plan-prop__actions">
                <button type="button" className="button-tint" aria-label={`Use ${pr.recipeName} for ${where}`} onClick={() => p.onUse(pr)}>Use this</button>
                <button type="button" className="button-outline" aria-label={`Show another dish for ${where}`} onClick={() => reject(pr)}>Another</button>
              </div>
            </li>
          );
        })}
      </ul>
      {proposals.length > 0 && (
        <button type="button" className="button-primary plan-wide" onClick={() => p.onUseAll(proposals)}>Use all</button>
      )}
    </Sheet>
  );
}
