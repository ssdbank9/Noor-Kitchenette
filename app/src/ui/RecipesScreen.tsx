import { useState } from 'react';
import type { Availability } from '../domain/suggest';
import type { Recipe } from '../domain/types';

export interface RecipesScreenProps {
  /** Already sorted: ready first, then by coverage (cookableNow). */
  items: { recipe: Recipe; availability: Availability }[];
  servings: number;
  onOpen: (recipeId: string) => void;
  onBack: () => void;
}

function status(a: Availability): { text: string; cls: string } {
  if (a.status === 'ready') return { text: 'Ready', cls: 'badge badge--ready' };
  if (a.status === 'missing') return { text: `Need ${a.missing.length}`, cls: 'badge badge--need' };
  return { text: 'Check stock', cls: 'badge badge--check' };
}

export function RecipesScreen(p: RecipesScreenProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const categories = [...new Set(p.items.map(i => i.recipe.category).filter((c): c is string => Boolean(c)))];
  const q = query.trim().toLowerCase();
  const shown = p.items.filter(
    i => (!category || i.recipe.category === category) && (!q || i.recipe.name.toLowerCase().includes(q)),
  );

  return (
    <div className="screen form-screen recipes">
      <div className="recipes__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <h1 className="title title--sm">Recipes</h1>
      </div>

      <input
        className="input"
        type="search"
        aria-label="Search recipes"
        placeholder="Search recipes"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <div className="filter-chips" role="group" aria-label="Category">
        <button type="button" className="choice-chip" aria-pressed={category === null} onClick={() => setCategory(null)}>All</button>
        {categories.map(c => (
          <button key={c} type="button" className="choice-chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</button>
        ))}
      </div>

      <p className="eyebrow" aria-live="polite">{shown.length} {shown.length === 1 ? 'dish' : 'dishes'} for {p.servings}</p>

      {shown.length === 0 ? (
        <p className="empty empty--flush">No dish matches. Try another name or category.</p>
      ) : (
        <ul className="rows">
          {shown.map(({ recipe, availability }) => {
            const s = status(availability);
            return (
              <li key={recipe.id} className="row">
                <button type="button" className="row__main" onClick={() => p.onOpen(recipe.id)}>
                  <span className="row__name">{recipe.name}</span>
                  <span className="recipes__meta">{recipe.category ? `${recipe.category} · ` : ''}{recipe.time}</span>
                </button>
                <span className={s.cls}>{s.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
