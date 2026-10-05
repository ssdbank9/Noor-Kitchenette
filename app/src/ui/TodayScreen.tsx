import { useState } from 'react'; // F54
import type { PlannedHero } from '../domain/plan'; // F54
import type { Availability, Suggestion } from '../domain/suggest';
import type { Recipe } from '../domain/types';
import { CameraIcon, ForkKnifeIcon, GearIcon, PotIcon } from './Icons';

export interface TodayProps {
  dateLabel: string;
  slotLabel: string;
  servings: number;
  suggestion: Suggestion | null;
  ready: { recipe: Recipe; availability: Availability }[];
  almost: { recipe: Recipe; availability: Availability; missingNames: string[] }[];
  yesWord: string;
  onCook: (recipeId: string) => void;
  onAnother: () => void;
  onOpenRecipe: (recipeId: string) => void;
  onAddToList: (recipeId: string) => void;
  onSeeAll: () => void;
  onEatOut: () => void;
  onSnap: () => void;
  onAddDish: () => void; // F80
  pantryEmpty: boolean; // settings
  onSettings: () => void; // settings
  onOpenPantry: () => void; // settings
  onLoadSample: () => void; // settings
  /** F67: names of things to use soon (leftovers and ingredients); the row is hidden when empty. */
  useSoon?: string[];
  onUseSoon?: () => void;
  planned?: PlannedHero | null; // F54: what the plan says for the next meal
  onCookPlanned?: (mealId: string, itemIndex: number) => void; // F54
}

const TILE_COLOURS = ['tile--cyan', 'tile--rust', 'tile--lilac'];

export function TodayScreen(p: TodayProps) {
  const [showSuggestions, setShowSuggestions] = useState(false); // F54
  const planned = showSuggestions ? null : (p.planned ?? null); // F54
  return (
    <div className="screen">
      <header className="screen__header today-header">
        <div>
          <div className="eyebrow">{p.dateLabel}</div>
          <h1 className="title">Assalam-o-alaikum, Noor</h1>
        </div>
        <button type="button" className="icon-button icon-button--outlined" aria-label="Settings" onClick={p.onSettings}><GearIcon /></button>
      </header>

      {p.pantryEmpty && ( // settings
        <section className="hero empty-pantry" aria-label="Empty pantry">
          <div className="hero__name">Your pantry is empty.</div>
          <p className="empty-pantry__text">Snap or add what you have, or try the sample pantry.</p>
          <div className="hero__actions">
            <button type="button" className="button-primary" onClick={p.onOpenPantry}>Go to Pantry</button>
            <button type="button" className="button-outline" onClick={p.onLoadSample}>Load sample pantry</button>
          </div>
        </section>
      )}

      {planned ? ( // F54
        <section className="hero hero--planned" aria-label="Planned next meal">
          <div className="hero__label">Next meal · {p.slotLabel}</div>
          {planned.kind === 'eatout' ? (
            <div className="hero__dish">
              <div className="hero__tile"><ForkKnifeIcon /></div>
              <div><div className="hero__name">{planned.label ? `Eating out: ${planned.label}` : 'Eating out'}</div><div className="hero__meta">No cooking planned</div></div>
            </div>
          ) : (
            <div className="hero__dish">
              <div className="hero__tile"><PotIcon /></div>
              <div>
                <div className="hero__name">{planned.dishes.map(d => d.recipeName).join(' + ')}</div>
                <div className="hero__meta">For {planned.meal.servings}</div>
              </div>
            </div>
          )}
          <ul className="chips" aria-label="Plan"><li className="chip chip--good">Planned</li></ul>
          <div className="hero__actions">
            {planned.kind === 'dish' && (
              <button type="button" className="button-primary" onClick={() => p.onCookPlanned?.(planned.meal.id, planned.dishes[0].index)}>
                {p.yesWord}, let's cook
              </button>
            )}
            <button type="button" className="button-outline" onClick={() => setShowSuggestions(true)}>Show suggestions instead</button>
          </div>
          <button type="button" className="hero__eatout" onClick={p.onEatOut}>
            <ForkKnifeIcon /> Not in the mood to cook? Eat out
          </button>
        </section>
      ) : p.pantryEmpty ? null : p.suggestion ? (
        <section className="hero" aria-label="Suggested next meal">
          <svg className="hero__motif" aria-hidden="true" viewBox="0 0 190 190">
            <circle cx="95" cy="95" r="94" fill="var(--cyan)" />
            <circle cx="95" cy="95" r="62" fill="var(--rust)" />
            <circle cx="95" cy="95" r="30" fill="#fff" />
          </svg>
          <div className="hero__label">Next meal · {p.slotLabel}</div>
          <div className="hero__dish">
            <div className="hero__tile"><PotIcon /></div>
            <div>
              <div className="hero__name">{p.suggestion.recipe.name}</div>
              <div className="hero__meta">For {p.servings} · {p.suggestion.recipe.time}</div>
            </div>
          </div>
          <ul className="chips" aria-label="Why this dish">
            {p.suggestion.reasons.map(r => (
              <li key={r} className={r === 'You have everything' ? 'chip chip--good' : 'chip'}>{r}</li>
            ))}
          </ul>
          <div className="hero__actions">
            <button type="button" className="button-primary" onClick={() => p.onCook(p.suggestion!.recipe.id)}>
              {p.yesWord}, let's cook
            </button>
            <button type="button" className="button-outline" onClick={p.onAnother}>Show another</button>
          </div>
          <button type="button" className="hero__eatout" onClick={p.onEatOut}>
            <ForkKnifeIcon /> Not in the mood to cook? Eat out
          </button>
        </section>
      ) : (
        <section className="hero" aria-label="Suggested next meal">
          <div className="hero__name">Add some pantry items to get suggestions</div>
        </section>
      )}

      {p.useSoon && p.useSoon.length > 0 && ( // F67
        <section className="usesoon-row" aria-label="Use soon">
          <span className="usesoon-row__label">Use soon</span>
          <div className="usesoon-row__chips">
            {p.useSoon.slice(0, 4).map(n => (
              <button key={n} type="button" className="usesoon-chip" onClick={p.onUseSoon}>{n}</button>
            ))}
            {p.useSoon.length > 4 && <button type="button" className="usesoon-chip" onClick={p.onUseSoon}>+{p.useSoon.length - 4} more</button>}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Ready now · {p.ready.length}</h2>
          <button type="button" className="section__see-all" onClick={p.onSeeAll}>See all</button>
        </div>
        {p.ready.length === 0 && (
          <p className="empty">{p.pantryEmpty ? 'Dishes you can cook will show here.' : 'Nothing is fully ready yet. Check "Almost there".'}</p>
        )}
        <ul className="tiles">
          {p.ready.map(({ recipe }, i) => (
            <li key={recipe.id}>
              <button type="button" className="tile" onClick={() => p.onOpenRecipe(recipe.id)}>
                <span className={`tile__art ${TILE_COLOURS[i % TILE_COLOURS.length]}`}><PotIcon size={40} /></span>
                <span className="tile__name">{recipe.name}</span>
                <span className="tile__meta">{recipe.time}</span>
              </button>
            </li>
          ))}
          <li>{/* F80 */}
            <button type="button" className="tile tile--add" onClick={p.onAddDish}>
              <span className="tile__art tile__art--add" aria-hidden="true">+</span>
              <span className="tile__name">Add a new dish</span>
              <span className="tile__meta">Look it up by name</span>
            </button>
          </li>
        </ul>
      </section>

      {!p.pantryEmpty && p.almost.length > 0 && (
        <section className="section section--padded">
          <h2 className="section__title">Almost there</h2>
          <ul className="rows">
            {p.almost.map(({ recipe, missingNames }) => (
              <li key={recipe.id} className="row">
                <button type="button" className="row__main" onClick={() => p.onOpenRecipe(recipe.id)}>
                  <span className="row__name">{recipe.name}</span>
                  <span className="row__need">Need: {missingNames.join(', ')}</span>
                </button>
                <button type="button" className="button-tint" onClick={() => p.onAddToList(recipe.id)}
                  aria-label={`Add what ${recipe.name} needs to the shopping list`}>+ List</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="snap" onClick={p.onSnap}>
        <CameraIcon /> Snap pantry
      </button>
    </div>
  );
}
