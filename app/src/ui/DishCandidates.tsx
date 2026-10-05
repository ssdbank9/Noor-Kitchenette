// The dishes found online, as cards Noor chooses from (F78, F80). Every fact on a card is either
// something the search found or the words "not checked": nothing is guessed.
import { ratingText, viewsText } from '../gemini/dish';
import type { DishCandidate } from '../gemini/drafts';

/** "5 Oct 2026" for a YYYY-MM-DD date. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export interface DishCandidatesProps {
  query: string;
  candidates: DishCandidate[];
  yesWord: string;
  onChoose: (candidate: DishCandidate) => void;
  onSearchAgain: () => void;
}

export function DishCandidates(p: DishCandidatesProps) {
  return (
    <section className="adddish__section" aria-label="Recipes found online">
      <h2 className="section__title">Found online for "{p.query}"</h2>
      <p className="adddish__hint">Names and spellings differ, so you choose. Nothing is saved until you check it.</p>
      <ul className="adddish__cards">
        {p.candidates.map(c => (
          <li key={c.sourceUrl} className="dish-card">
            <h3 className="dish-card__title">{c.title}</h3>
            <div className="dish-card__source">{c.sourceName}</div>
            <div className="dish-card__facts">
              <span className={c.rating === null ? 'dish-fact dish-fact--unknown' : 'dish-fact'}>{ratingText(c)}</span>
              <span className={c.views === null ? 'dish-fact dish-fact--unknown' : 'dish-fact'}>{viewsText(c)}</span>
              {c.videoUrl ? <span className="dish-badge dish-badge--video">▶ Video</span> : <span className="dish-badge">No video link</span>}
            </div>
            {c.summary && <p className="dish-card__summary">{c.summary}</p>}
            <div className="dish-card__checked">checked {shortDate(c.checkedOn)}</div>
            <button type="button" className="button-primary dish-card__use" aria-label={`Use ${c.title} from ${c.sourceName}`} onClick={() => p.onChoose(c)}>
              {p.yesWord}, use this one
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="button-outline adddish__wide" onClick={p.onSearchAgain}>
        None of these? Search again with a different spelling
      </button>
    </section>
  );
}
