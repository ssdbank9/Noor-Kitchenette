import { useState } from 'react';
import type { Availability } from '../domain/suggest';
import type { Ingredient, Recipe } from '../domain/types';
import { youtubeId } from '../lib/youtubeId';
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
  /** F40: open the recipe editor. */
  onEdit: () => void;
}

export function RecipeScreen(p: RecipeScreenProps) {
  const [servings, setServings] = useState(p.initialServings);
  const [showAll, setShowAll] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const a = p.availabilityFor(servings);
  const rows = showAll ? a.needs : a.needs.slice(0, 4);
  const vid = youtubeId(p.recipe.videoUrl);
  // The links that match this recipe's ingredient list come first. Better-rated versions
  // are different recipes (amounts and steps differ), so they are offered separately and
  // never silently replace the instructions the stock check is based on.
  const written = p.recipe.writtenUrl;
  const video = p.recipe.videoUrl;
  const altWritten = p.recipe.recommendedWrittenUrl;
  const altVideo = p.recipe.recommendedVideoUrl;

  const banner =
    a.status === 'ready' ? { cls: 'status status--good', text: `You have everything. You can cook this!` }
    : a.status === 'maybe' ? { cls: 'status status--maybe', text: 'Not sure about a few things — check the ones marked ?' }
    : { cls: 'status status--short', text: `You don't have ${a.missing.length} ${a.missing.length === 1 ? 'thing' : 'things'}. They are marked below.` };

  return (
    <div className="screen recipe">
      <div className="recipe__art">
        {vid && !thumbFailed ? (
          <a className="recipe__video" href={p.recipe.videoUrl} target="_blank" rel="noreferrer" aria-label="Watch the video">
            <img
              src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`}
              alt=""
              onError={() => setThumbFailed(true)}
            />
            <span className="recipe__play" aria-hidden="true">▶</span>
          </a>
        ) : (
          <PotIcon size={88} />
        )}
        <button type="button" className="icon-button recipe__back" aria-label="Back" onClick={p.onBack}>‹</button>
      </div>
      <div className="recipe__sheet">
        <div className="own-head"> {/* F40: Edit button */}
          <div>
            <h1 className="title">{p.recipe.name}</h1>
            <div className="eyebrow">
              {p.recipe.time}
              {p.timesThisMonth > 0 ? ` · You cooked this ${p.timesThisMonth} ${p.timesThisMonth === 1 ? 'time' : 'times'} this month` : ''}
            </div>
          </div>
          <button type="button" className="button-outline own-edit" onClick={p.onEdit}>Edit</button>
        </div>

        <div className="stepper-row">
          <span className="stepper-row__label">How many people are eating?</span>
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
              n.status === 'maybe' ? '?'
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

        {p.recipe.steps && p.recipe.steps.length > 0 && ( // F40 + Part 0: the recipe itself, in the app
          <section className="own-method" aria-labelledby="own-method-h">
            <h2 id="own-method-h" className="own-method__title">How to make it</h2>
            <ol className="own-method__list">
              {p.recipe.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </section>
        )}

        <div className="sources">
          {video && <a className="source source--video" href={video} target="_blank" rel="noreferrer">▶ Watch the video</a>}
          {written && <a className="source" href={written} target="_blank" rel="noreferrer">Read the recipe</a>}
        </div>
        {(altWritten || altVideo) && (
          <div className="alt">
            <div className="alt__title">Another version people liked more</div>
            <div className="alt__note">Careful: its amounts are for that recipe, not this list.</div>
            <div className="alt__links">
              {altVideo && <a href={altVideo} target="_blank" rel="noreferrer">Watch that one</a>}
              {altWritten && <a href={altWritten} target="_blank" rel="noreferrer">Read that one</a>}
            </div>
          </div>
        )}
        {p.recipe.notes && <p className="recipe__notes">{p.recipe.notes}</p>}
      </div>
      <div className="action-bar">
        <button type="button" className="button-primary action-bar__main" onClick={() => p.onCooked(servings)}>I cooked this</button>
      </div>
    </div>
  );
}
