import { useMemo, useState } from 'react';
import type { MealRating, MealSlot, StorageLocation } from '../domain/types';

export interface CookedChoice {
  /** Household-local date, YYYY-MM-DD. */
  localDate: string;
  /** Household-local time, HH:MM. */
  localTime: string;
  slot: MealSlot;
  servings: number;
  rating?: MealRating;
  /** true: deduct the recipe amounts; false: Noor adjusts each amount next. */
  usedRecipeAmounts: boolean;
  /** F65: portions left over, and where they are kept. Missing or 0 means none. */
  leftover?: { portions: number; location: StorageLocation };
}

export interface CookedScreenProps {
  recipeName: string;
  /** Household-local today, YYYY-MM-DD. */
  today: string;
  slotTimes: Record<MealSlot, string>;
  initialSlot: MealSlot;
  initialServings: number;
  yesWord: string;
  noWord: string;
  onBack: () => void;
  onSave: (choice: CookedChoice) => void;
}

const SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'chai', label: 'Chai' },
  { id: 'dinner', label: 'Dinner' },
];

const RATINGS: { id: MealRating; label: string }[] = [
  { id: 'loved', label: 'Loved it' },
  { id: 'ok', label: 'It was ok' },
  { id: 'not-again', label: 'Not again' },
];

/** The last 7 local days ending today, as YYYY-MM-DD, with short labels. */
export function lastSevenDays(today: string): { date: string; weekday: string; day: number }[] {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d - (6 - i)));
    return {
      date: dt.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(dt),
      day: dt.getUTCDate(),
    };
  });
}

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export function CookedScreen(p: CookedScreenProps) {
  const days = useMemo(() => lastSevenDays(p.today), [p.today]);
  const [date, setDate] = useState(p.today);
  const [slot, setSlot] = useState<MealSlot>(p.initialSlot);
  const [time, setTime] = useState(p.slotTimes[p.initialSlot]);
  const [servings, setServings] = useState(p.initialServings);
  const [rating, setRating] = useState<MealRating | undefined>();
  const [used, setUsed] = useState<boolean | undefined>();
  const [left, setLeft] = useState(0); // F65
  const [where, setWhere] = useState<StorageLocation>('fridge'); // F65

  const pickSlot = (s: MealSlot) => { setSlot(s); setTime(p.slotTimes[s]); };
  const times = SLOTS.map(s => p.slotTimes[s.id]);

  return (
    <div className="screen form-screen">
      <header className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <div>
          <div className="eyebrow">{p.recipeName}</div>
          <h1 className="title title--sm">Well done! Quick check</h1>
        </div>
      </header>

      <section className="panel" aria-labelledby="when">
        <h2 id="when" className="panel__title">When?</h2>
        <div className="day-strip" role="group" aria-label="Day">
          {days.map(d => (
            <button key={d.date} type="button" className="day" aria-pressed={d.date === date} onClick={() => setDate(d.date)}>
              <span className="day__weekday">{d.date === p.today ? 'Today' : d.weekday}</span>
              <span className="day__num">{d.day}</span>
            </button>
          ))}
        </div>
        <div className="choice-grid choice-grid--4" role="group" aria-label="Time">
          {times.map(t => (
            <button key={t} type="button" className="choice" aria-pressed={t === time} onClick={() => setTime(t)}>{to12h(t)}</button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="meal">
        <h2 id="meal" className="panel__title">Which meal?</h2>
        <div className="choice-grid choice-grid--4" role="group" aria-label="Meal">
          {SLOTS.map(s => (
            <button key={s.id} type="button" className="choice" aria-pressed={s.id === slot} onClick={() => pickSlot(s.id)}>{s.label}</button>
          ))}
        </div>
      </section>

      <section className="stepper-row panel--inline" aria-label="People who ate">
        <span className="stepper-row__label">People who ate</span>
        <div className="stepper">
          <button type="button" aria-label="Fewer people" onClick={() => setServings(s => Math.max(1, s - 1))}>−</button>
          <output aria-live="polite">{servings}</output>
          <button type="button" aria-label="More people" onClick={() => setServings(s => Math.min(30, s + 1))}>+</button>
        </div>
      </section>

      <section className="panel" aria-labelledby="liked">
        <h2 id="liked" className="panel__title">Did everyone like it?</h2>
        <div className="choice-grid choice-grid--3" role="group" aria-label="How was it">
          {RATINGS.map(r => (
            <button key={r.id} type="button" className="choice" aria-pressed={r.id === rating} onClick={() => setRating(r.id)}>{r.label}</button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="leftover">{/* F65 */}
        <h2 id="leftover" className="panel__title">Anything left over?</h2>
        <div className="stepper-row panel--inline" aria-label="Portions left over">
          <span className="stepper-row__label">Portions left</span>
          <div className="stepper">
            <button type="button" aria-label="Fewer portions left" onClick={() => setLeft(n => Math.max(0, n - 1))}>−</button>
            <output aria-live="polite">{left}</output>
            <button type="button" aria-label="More portions left" onClick={() => setLeft(n => Math.min(30, n + 1))}>+</button>
          </div>
        </div>
        {left > 0 && (
          <div className="choice-grid choice-grid--2" role="group" aria-label="Where it is kept">
            {(['fridge', 'freezer'] as const).map(l => (
              <button key={l} type="button" className="choice" aria-pressed={where === l} onClick={() => setWhere(l)}>{l === 'fridge' ? 'Fridge' : 'Freezer'}</button>
            ))}
          </div>
        )}
      </section>

      <section className="question" aria-labelledby="amounts">
        <h2 id="amounts" className="question__title">Did you use the amounts in the recipe?</h2>
        <div className="choice-grid choice-grid--2">
          <button type="button" className="answer answer--yes" aria-pressed={used === true} onClick={() => setUsed(true)}>{p.yesWord}</button>
          <button type="button" className="answer answer--no" aria-pressed={used === false} onClick={() => setUsed(false)}>{p.noWord}</button>
        </div>
      </section>

      <div className="action-bar">
        <button
          type="button"
          className="button-save action-bar__main"
          disabled={used === undefined}
          onClick={() => p.onSave({ localDate: date, localTime: time, slot, servings, rating, usedRecipeAmounts: used!, ...(left > 0 ? { leftover: { portions: left, location: where } } : {}) })}
        >
          Save
        </button>
        <p className="action-bar__hint">You can undo this anytime from History</p>
      </div>
    </div>
  );
}
