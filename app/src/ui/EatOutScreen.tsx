// Eat out tonight (F83, F84). Pick Order in or Go out, tap a mood, see ONLY that mood's places
// from the restaurant list (plus our own favourites for it), and hand off to foodpanda.
//
// UNVERIFIED: Order is a plain https link opened in a new tab (rel="noopener"). On a phone this
// MAY open the foodpanda app instead of the browser; that has not been tried on a real phone.
// Prices are never shown: foodpanda's budget is only a category, and live prices are on foodpanda.
import { useEffect, useRef, useState } from 'react';
import {
  allMoods, buildFavourite, directionsUrl, favouritesForMood, FOODPANDA_HOME, formatListDate, isOld, loadEatOutList,
  MAX_MOOD_CHARS, placesForMood, type PlaceOrder, priceLevelText, ratingText, suggestFavourite, suggestionReason,
  type EatOutList, type ShownPlace,
} from '../domain/eatout';
import { formatDistance } from '../domain/geo';
import type { Favourite } from '../domain/types';
import { cleanText } from '../gemini/sanitize';
import { copyThenOpen } from './storeHandoff';

export interface EatOutScreenProps {
  favourites: Favourite[];
  /** Household-local date, YYYY-MM-DD. */
  today: string;
  timeZone: string;
  yesWord: string;
  noWord: string;
  /** The household's area from Settings (kept on the phone), if chosen. */
  homeArea?: { label: string; lat: number; lng: number };
  onOpenSettings?: () => void;
  onSave: (favourite: Favourite) => void;
  onDelete: (id: string) => void;
  onToast: (text: string) => void;
  onBack: () => void;
}

type FormState = { editing?: Favourite; mood?: string; focusMood?: boolean };
type Mode = 'order' | 'out';

const newId = () => `fav-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}`;

function OrderLink({ name, url, onCopy }: { name: string; url: string | null; onCopy: (name: string) => void }) {
  return url ? (
    <a className="button-primary eatout__order" href={url} target="_blank" rel="noopener noreferrer">
      Order<span className="eatout__sr"> {name}</span>
    </a>
  ) : (
    <button type="button" className="button-primary eatout__order" onClick={() => onCopy(name)}>Copy name and open foodpanda</button>
  );
}

export function EatOutScreen(p: EatOutScreenProps) {
  const [mode, setMode] = useState<Mode>('order');
  const [mood, setMood] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [list, setList] = useState<EatOutList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [order, setOrder] = useState<PlaceOrder>('nearest');
  const now = new Date();

  useEffect(() => {
    let live = true;
    void loadEatOutList().then(r => { if (live) { setList(r.list); setLoaded(true); } });
    return () => { live = false; };
  }, []);

  // Starts the copy first (the page must still have focus), then opens foodpanda in the same tap.
  async function copyAndOpen(text: string) {
    const copied = await copyThenOpen(text, FOODPANDA_HOME);
    setNote(copied
      ? `Copied "${text}". Paste it into foodpanda's search.`
      : `Could not copy. Type this into foodpanda's search: ${text}`);
  }

  if (form) {
    return (
      <FavouriteForm
        key={form.editing?.id ?? 'new'}
        state={form}
        moods={allMoods(p.favourites)}
        onCancel={() => setForm(null)}
        onSave={fav => {
          p.onSave(fav);
          p.onToast(form.editing ? `Saved changes to ${fav.dish}.` : `Added ${fav.dish} to our favourites.`);
          setForm(null);
        }}
      />
    );
  }

  const moods = allMoods(p.favourites);
  const suggestion = suggestFavourite(p.favourites, mood, skip);
  const moodFavs = mood ? favouritesForMood(p.favourites, mood) : [];
  const places = mood ? placesForMood(list, mood, order, p.homeArea) : [];
  const stale = list ? isOld(list.generatedAt, now) : false;

  function ordered(f: Favourite) {
    p.onSave({ ...f, lastOrderedOn: p.today });
    p.onToast(`Noted: ${f.dish} ordered today.`);
  }

  const favActions = (f: Favourite, withOrder: boolean) => (
    <div className="eatout__actions">
      {withOrder && mode === 'order' && <OrderLink name={f.place} url={f.url ?? null} onCopy={n => void copyAndOpen(n)} />}
      <a className="button-outline eatout__link" href={directionsUrl(f.place, f.area)} target="_blank" rel="noopener noreferrer">
        Directions<span className="eatout__sr"> to {f.place}</span>
      </a>
      <button type="button" className="button-tint" onClick={() => ordered(f)}>Ordered it<span className="eatout__sr"> {f.dish}</span></button>
    </div>
  );

  return (
    <div className="screen eatout">
      <header className="settings__header">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <h1 className="title title--sm">Eat out tonight</h1>
      </header>

      <div className="eatout__pad">
        <div className="choice-grid choice-grid--2" role="group" aria-label="How are we eating">
          <button type="button" className="choice" aria-pressed={mode === 'order'} onClick={() => setMode('order')}>Order in</button>
          <button type="button" className="choice" aria-pressed={mode === 'out'} onClick={() => setMode('out')}>Go out</button>
        </div>
      </div>

      <section className="eatout__pad eatout__section" aria-labelledby="eo-mood">
        <h2 id="eo-mood" className="panel__title">In the mood for...</h2>
        <div className="eatout__moods">
          {moods.map(m => (
            <button key={m} type="button" className="choice-chip" aria-pressed={mood === m} onClick={() => { setMood(mood === m ? null : m); setSkip(0); setNote(''); }}>{m}</button>
          ))}
          <button type="button" className="choice-chip eatout__more" onClick={() => setForm({ focusMood: true })}>+ More</button>
        </div>
      </section>

      {note && <p className="eatout__note eatout__pad" role="status">{note}</p>}

      <section className="eatout__pad eatout__section" aria-labelledby="eo-sug">
        <h2 id="eo-sug" className="panel__title">Suggested for tonight</h2>
        {suggestion ? (
          <div className="eatout__card eatout__card--hero">
            <div className="eatout__name">{suggestion.dish}</div>
            <div className="eatout__meta">{suggestion.place}{suggestion.area ? ` · ${suggestion.area}` : ''}</div>
            <div className="eatout__meta">{suggestionReason(suggestion, p.today)}</div>
            {favActions(suggestion, true)}
            {p.favourites.length > 1 && <button type="button" className="button-outline" onClick={() => setSkip(s => s + 1)}>Show another</button>}
          </div>
        ) : (
          <p className="eatout__empty">Add a favourite below and it will be suggested here.</p>
        )}
      </section>

      {mood && (
        <section className="eatout__pad eatout__section" aria-labelledby="eo-places">
          <h2 id="eo-places" className="panel__title">{mode === 'order' ? `${mood} places` : `${mood} favourites`}</h2>
          {mode === 'order' && list && (
            <p className="eatout__meta">
              Updated {formatListDate(list.generatedAt, p.timeZone)}
              {stale && <> · <strong className="eatout__old">This list is old</strong>. Ask Aly to refresh it.</>}
            </p>
          )}
          {moodFavs.map(f => (
            <article key={f.id} className="eatout__card" aria-label={`Our favourite ${f.dish}`}>
              <span className="badge eatout__fav">Our favourite</span>
              <div className="eatout__name">{f.dish}</div>
              <div className="eatout__meta">{f.place}{f.area ? ` · ${f.area}` : ''}</div>
              {favActions(f, true)}
            </article>
          ))}
          {mode === 'order' && (
            <div className="eatout__order-by">
              {p.homeArea ? (
                <div className="choice-grid choice-grid--2" role="group" aria-label="Sort places">
                  <button type="button" className="choice" aria-pressed={order === 'rating'} onClick={() => setOrder('rating')}>Best rated</button>
                  <button type="button" className="choice" aria-pressed={order === 'nearest'} onClick={() => setOrder('nearest')}>Nearest first</button>
                </div>
              ) : (
                p.onOpenSettings && <button type="button" className="eatout__setarea" onClick={p.onOpenSettings}>Set where you live in Settings to see the nearest</button>
              )}
            </div>
          )}
          {mode === 'order' && places.map(({ place: pl, km }: ShownPlace) => (
            <article key={pl.name} className="eatout__card" aria-label={pl.name}>
              <div className="eatout__name">{pl.name}</div>
              {km !== null && <p className="eatout__distance">{formatDistance(km)} away</p>}
              <div className="eatout__meta">{ratingText(pl)}</div>
              {pl.budget !== null && <div className="eatout__meta">{priceLevelText(pl.budget)}</div>}
              <div className="eatout__actions"><OrderLink name={pl.name} url={pl.url} onCopy={n => void copyAndOpen(n)} /></div>
            </article>
          ))}
          {mode === 'order' && places.length === 0 && loaded && (
            <div className="eatout__card eatout__card--empty">
              <p className="eatout__empty">
                {list ? `No ${mood} places in the list yet.` : 'No restaurant list on this phone yet. Aly can add one in Settings.'}
                {' '}Try foodpanda itself.
              </p>
              <button type="button" className="button-primary" onClick={() => void copyAndOpen(mood)}>Search foodpanda</button>
            </div>
          )}
          {mode === 'out' && moodFavs.length === 0 && <p className="eatout__empty">No {mood} favourites yet. Add one below.</p>}
        </section>
      )}

      <section className="eatout__pad eatout__section" aria-labelledby="eo-favs">
        <div className="eatout__head">
          <h2 id="eo-favs" className="panel__title">Our favourites</h2>
          <button type="button" className="button-tint" onClick={() => setForm({ mood: mood ?? undefined })}>Add a favourite</button>
        </div>
        {p.favourites.length === 0 && <p className="eatout__empty">Nothing saved yet. Add the dishes and places we love.</p>}
        {p.favourites.map(f => (
          <article key={f.id} className="eatout__card" aria-label={`Favourite ${f.dish}`}>
            <div className="eatout__name">{f.dish}</div>
            <div className="eatout__meta">{f.place}{f.area ? ` · ${f.area}` : ''}</div>
            {f.moods.length > 0 && <ul className="chips">{f.moods.map(m => <li key={m} className="chip">{m}</li>)}</ul>}
            {favActions(f, false)}
            {deleting === f.id ? (
              <div className="settings__confirm" role="alertdialog" aria-label={`Delete ${f.dish}`}>
                <p>Delete {f.dish}?</p>
                <div className="choice-grid choice-grid--2">
                  <button type="button" className="answer answer--yes" onClick={() => { p.onDelete(f.id); setDeleting(null); p.onToast(`Deleted ${f.dish}.`); }}>{p.yesWord}</button>
                  <button type="button" className="answer answer--no" onClick={() => setDeleting(null)}>{p.noWord}</button>
                </div>
              </div>
            ) : (
              <div className="eatout__actions">
                <button type="button" className="button-outline" onClick={() => setForm({ editing: f })}>Edit<span className="eatout__sr"> {f.dish}</span></button>
                <button type="button" className="button-outline" onClick={() => setDeleting(f.id)}>Delete<span className="eatout__sr"> {f.dish}</span></button>
              </div>
            )}
          </article>
        ))}
      </section>

      <p className="eatout__pad eatout__meta">
        {!loaded ? 'Checking for a restaurant list...' : list ? `Restaurant list updated ${formatListDate(list.generatedAt, p.timeZone)}.` : 'No restaurant list loaded.'} Prices are on foodpanda.
      </p>
    </div>
  );
}

function FavouriteForm({ state, moods, onCancel, onSave }: {
  state: FormState;
  moods: string[];
  onCancel: () => void;
  onSave: (f: Favourite) => void;
}) {
  const e = state.editing;
  const [dish, setDish] = useState(e?.dish ?? '');
  const [place, setPlace] = useState(e?.place ?? '');
  const [area, setArea] = useState(e?.area ?? '');
  const [url, setUrl] = useState(e?.url ?? '');
  const [picked, setPicked] = useState<string[]>(e?.moods ?? (state.mood ? [state.mood] : []));
  const [extra, setExtra] = useState('');
  const [error, setError] = useState('');
  const extraRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.focusMood) extraRef.current?.focus(); }, [state.focusMood]);

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const shown = [...moods, ...picked.filter(m => !moods.some(x => same(x, m)))];
  const toggle = (m: string) => setPicked(cur => (cur.some(x => same(x, m)) ? cur.filter(x => !same(x, m)) : [...cur, m]));
  function addExtra() {
    const w = cleanText(extra, MAX_MOOD_CHARS);
    if (!w) return;
    setPicked(cur => (cur.some(x => same(x, w)) ? cur : [...cur, w]));
    setExtra('');
  }

  function save() {
    const typed = cleanText(extra, MAX_MOOD_CHARS);
    const moodsNow = typed && !picked.some(x => same(x, typed)) ? [...picked, typed] : picked;
    const r = buildFavourite({ dish, place, area, url, moods: moodsNow }, e?.id ?? newId(), e);
    if (!r.ok) { setError(r.error); return; }
    onSave(r.favourite);
  }

  return (
    <div className="screen eatout">
      <header className="settings__header">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={onCancel}>‹</button>
        <h1 className="title title--sm">{e ? 'Edit favourite' : 'Add a favourite'}</h1>
      </header>
      <div className="eatout__pad eatout__form">
        <label className="eatout__field">Dish
          <input className="input" value={dish} maxLength={80} onChange={ev => { setDish(ev.target.value); setError(''); }} placeholder="e.g. Fajita pizza" />
        </label>
        <label className="eatout__field">Place name
          <input className="input" value={place} maxLength={80} onChange={ev => { setPlace(ev.target.value); setError(''); }} placeholder="e.g. Pizza Hut" />
        </label>
        <label className="eatout__field">Area (optional)
          <input className="input" value={area} maxLength={60} onChange={ev => setArea(ev.target.value)} placeholder="e.g. F-7 Markaz" />
        </label>
        <label className="eatout__field">foodpanda link (optional)
          <input className="input" value={url} inputMode="url" autoCapitalize="off" spellCheck={false} maxLength={500}
            onChange={ev => { setUrl(ev.target.value); setError(''); }} placeholder="https://www.foodpanda.pk/restaurant/..." />
        </label>
        <div className="eatout__field" role="group" aria-label="Moods">
          Moods
          <div className="eatout__moods">
            {shown.map(m => (
              <button key={m} type="button" className="choice-chip" aria-pressed={picked.some(x => same(x, m))} onClick={() => toggle(m)}>{m}</button>
            ))}
          </div>
          <div className="settings__keyrow">
            <input ref={extraRef} className="input" aria-label="New mood word" value={extra} maxLength={MAX_MOOD_CHARS}
              onChange={ev => setExtra(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); addExtra(); } }} placeholder="A new mood word, e.g. Biryani" />
            <button type="button" className="button-tint" onClick={addExtra}>Add mood</button>
          </div>
        </div>
        {error && <p className="settings__error" role="alert">{error}</p>}
        <div className="choice-grid choice-grid--2">
          <button type="button" className="button-save" onClick={save}>Save</button>
          <button type="button" className="button-outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
