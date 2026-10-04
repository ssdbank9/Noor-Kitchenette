import { useState } from 'react';
import type { Availability } from '../domain/suggest';
import type { Ingredient, Recipe } from '../domain/types';
import { PotIcon } from './Icons';

export interface RecipeScreenProps {
  recipe: Recipe;
  ingredientsById: Map<string, Ingredient>;
  initialServings: number;
  /** Availability for a number of servings (recomputed when the stepper changes, F3). */
  availabilityFor: (servings: number) => Availability;
  /** Base units to a friendly amount, e.g. 1500 -> "1.5 kg". */
  format: (baseAmount: number, ingredient: Ingredient) => string;
  timesThisMonth: number;
  onBack: () => void;
  onCooked: (servings: number) => void;
}

export function RecipeScreen(p: RecipeScreenProps) {
  const [servings, setServings] = useState(p.initialServings);
  const [showAll, setShowAll] = useState(false);
  const a = p.availabilityFor(servings);
  const rows = showAll ? a.needs : a.needs.slice(0, 4);
  const written = p.recipe.recommendedWrittenUrl ?? p.recipe.writtenUrl;
  const video = p.recipe.recommendedVideoUrl ?? p.recipe.videoUrl;

  const banner =
    a.status === 'ready' ? { cls: 'status status--good', text: `You have everything for ${servings}` }
    : a.status === 'maybe' ? { cls: 'status status--maybe', text: 'Check the items marked "not sure"' }
    : { cls: 'status status--short', text: `Short of ${a.missing.length} ${a.missing.length === 1 ? 'item' : 'items'} for ${servings}` };

  return (
    <div className="screen recipe">
      <div className="recipe__art">
        <PotIcon size={88} />
        <button type="button" className="icon-button recipe__back" aria-label="Back" onClick={p.onBack}>‹</button>
      </div>
      <div className="recipe__sheet">
        <div>
          <h1 className="title">{p.recipe.name}</h1>
          <div className="eyebrow">
            {p.recipe.time}
            {p.timesThisMonth > 0 ? ` · cooked ${p.timesThisMonth} ${p.timesThisMonth === 1 ? 'time' : 'times'} this month` : ''}
          </div>
        </div>

        <div className="stepper-row">
          <span className="stepper-row__label">Cooking for</span>
          <div className="stepper">
            <button type="button" aria-label="Fewer people" onClick={() => setServings(s => Math.max(1, s - 1))}>−</button>
            <output aria-live="polite">{servings}</output>
            <button type="button" aria-label="More people" onClick={() => setServings(s => Math.min(30, s + 1))}>+</button>
          </div>
        </div>

        <div className={banner.cls} role="status">{banner.text}</div>

        <ul className="ingredients">
          {rows.map(n => {
            const ing = p.ingredientsById.get(n.ingredientId);
            const name = ing?.name ?? n.ingredientId;
            const need = n.need !== null && ing ? p.format(n.need, ing) : 'see recipe';
            const have =
              n.status === 'maybe' ? 'not sure'
              : n.have !== null && ing ? `have ${p.format(n.have, ing)}`
              : '';
            return (
              <li key={n.ingredientId} className={`ingredient ingredient--${n.status}`}>
                <span className="ingredient__name">{name}</span>
                <span className="ingredient__amounts">{need} <span className="ingredient__have">· {have}</span></span>
              </li>
            );
          })}
        </ul>
        {a.needs.length > 4 && (
          <button type="button" className="link-button" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show fewer' : `See all ${a.needs.length} ingredients`}
          </button>
        )}

        <div className="sources">
          {video && <a className="source source--video" href={video} target="_blank" rel="noreferrer">▶ Watch</a>}
          {written && <a className="source" href={written} target="_blank" rel="noreferrer">Read recipe</a>}
        </div>
        {p.recipe.notes && <p className="recipe__notes">{p.recipe.notes}</p>}
      </div>
      <div className="action-bar">
        <button type="button" className="button-primary action-bar__main" onClick={() => p.onCooked(servings)}>I cooked this</button>
      </div>
    </div>
  );
}
