// Snap pantry (F28-F30, F52, F53, F57, F73): the whole flow in one screen. Choose what the
// photo is, take or pick it (or type a list instead), let Gemini read it, review every line,
// and save ONE event. Photos live only in memory until Gemini has read them. Manual entry
// stays possible at every step: no key, no camera, bad photo, timeout, no internet, rate limit.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Balance } from '../domain/ledger';
import {
  addSource,
  buildDraftEvent,
  linesFromPhoto,
  linesFromTyped,
  makeNewIngredient,
  newDraft,
  updateLine,
  type Draft,
  type LinePatch,
} from '../domain/photoDraft';
import type { Dimension, Ingredient, KitchenEvent } from '../domain/types';
import { useGemini } from '../gemini/GeminiContext';
import type { PhotoKind } from '../gemini/drafts';
import { isGeminiError, plainMessage } from '../gemini/errors';
import { prepareImage, readPhoto, type PreparedImage } from '../gemini/photo';
import { CameraIcon } from './Icons';
import { PhotoReview } from './PhotoReview';

export interface SnapSaveResult {
  event: KitchenEvent;
  /** Ingredients made in the review that are used by the event. */
  newIngredients: Ingredient[];
  toast: string;
}

export interface SnapPantryProps {
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  yesWord: string;
  noWord: string;
  /** Household-local date, YYYY-MM-DD. */
  today: string;
  timeZone: string;
  /** Records the event (and new ingredients). Must be safe to call twice with the same event id. */
  onSave: (result: SnapSaveResult) => void;
  onSettings: () => void;
  onClose: () => void;
}

type Source = { type: 'photo'; images: PreparedImage[] } | { type: 'typed'; text: string };
interface Job { kind: PhotoKind; source: Source }

type Phase =
  | { name: 'choose' }
  | { name: 'typed'; errors: string[] }
  | { name: 'working'; text: string }
  | { name: 'trip' }
  | { name: 'error'; message: string; retry: boolean; settings: boolean }
  | { name: 'review' }
  | { name: 'saved' };

const KIND_CHOICES: { kind: PhotoKind; label: string; hint: string }[] = [
  { kind: 'groceries', label: 'New groceries', hint: 'Things I just bought' },
  { kind: 'receipt', label: 'Shopping receipt', hint: 'The paper from the shop' },
  { kind: 'pantry', label: 'Check my pantry or fridge', hint: 'What is left on the shelf' },
];

export function SnapPantry(p: SnapPantryProps) {
  const { client, hasKey } = useGemini();
  const [phase, setPhase] = useState<Phase>({ name: 'choose' });
  const [kind, setKind] = useState<PhotoKind | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<Job | null>(null); // waiting for the "Same shopping trip?" answer
  const [parked, setParked] = useState<Job | null>(null); // a different trip's photo, read after this draft is saved or discarded
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const token = useRef(0);
  const lastJob = useRef<{ job: Job; base: Draft | null } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // A cancelled file chooser fires "cancel" (not "change"): say so and keep the manual list open.
  useEffect(() => {
    const inputs = [cameraRef.current, galleryRef.current];
    const onCancel = () => setNote('No photo was picked. You can try again or type a list.');
    inputs.forEach(i => i?.addEventListener('cancel', onCancel));
    return () => inputs.forEach(i => i?.removeEventListener('cancel', onCancel));
  }, [phase.name]);

  const closeRef = useRef(p.onClose);
  closeRef.current = p.onClose;
  // After a save, show "Saved" for a moment and then go back.
  useEffect(() => {
    if (phase.name !== 'saved') return;
    const t = setTimeout(() => closeRef.current(), 1200);
    return () => clearTimeout(t);
  }, [phase.name]);

  const allIngredients = useMemo(
    () => [...p.ingredients, ...(draft?.lines.flatMap(l => (l.newIngredient ? [l.newIngredient] : [])) ?? [])],
    [p.ingredients, draft],
  );
  const adding = draft !== null;
  const choices = draft && draft.mode === 'pantry' ? KIND_CHOICES.filter(c => c.kind === 'pantry')
    : draft ? KIND_CHOICES.filter(c => c.kind !== 'pantry') : KIND_CHOICES;
  const activeKind: PhotoKind | null = kind ?? (choices.length === 1 ? choices[0].kind : null);

  function back() {
    token.current++;
    setNote('');
    if (draft) setPhase({ name: 'review' });
    else p.onClose();
  }

  function apply(base: Draft | null, job: Job, lines: ReturnType<typeof linesFromPhoto>, readNote: string) {
    const d = base ?? newDraft(job.kind);
    const merged = addSource(d, job.kind, lines, job.source.type, readNote, [...p.ingredients, ...d.lines.flatMap(l => (l.newIngredient ? [l.newIngredient] : []))]);
    lastJob.current = null;
    setDraft(merged);
    setNote('');
    setSaveError('');
    setPhase({ name: 'review' });
  }

  async function run(job: Job, base: Draft | null) {
    lastJob.current = { job, base };
    const known = [...p.ingredients, ...(base?.lines.flatMap(l => (l.newIngredient ? [l.newIngredient] : [])) ?? [])];
    const sourceNo = (base?.sources ?? 0) + 1;
    if (job.source.type === 'typed') {
      const r = linesFromTyped(job.source.text, job.kind, sourceNo, known);
      if (r.errors.length || r.lines.length === 0) {
        setPhase({ name: 'typed', errors: r.errors.length ? r.errors : ['Type at least one item, like "Chicken 500 g".'] });
        return;
      }
      apply(base, job, r.lines, '');
      return;
    }
    const mine = ++token.current;
    setPhase({ name: 'working', text: 'Reading your photo...' });
    try {
      const result = await readPhoto(client, job.kind, job.source.images, p.today);
      if (mine !== token.current) return; // cancelled
      if (result.items.length === 0) {
        setPhase({ name: 'error', message: 'I could not find anything to read in that photo. Try a clearer one, or type a list.', retry: false, settings: false });
        return;
      }
      apply(base, job, linesFromPhoto(result.items, job.kind, sourceNo, known), result.note);
    } catch (e) {
      if (mine !== token.current) return;
      const code = isGeminiError(e) ? e.code : null;
      setPhase({ name: 'error', message: plainMessage(e), retry: isGeminiError(e) && e.retryable, settings: code === 'no-key' || code === 'bad-key' });
    }
  }

  /** A photo or typed list is ready: ask about the trip if it is a different kind of purchase photo, else read it. */
  function route(job: Job) {
    if (draft && draft.mode === 'purchase' && !draft.kinds.includes(job.kind)) {
      setPicked(job);
      setPhase({ name: 'trip' });
      return;
    }
    void run(job, draft);
  }

  async function onFile(file: File | undefined) {
    if (!activeKind) return;
    if (!file) { setNote('No photo was picked. You can try again or type a list.'); return; }
    const mine = ++token.current;
    setNote('');
    setPhase({ name: 'working', text: 'Getting your photo ready...' });
    try {
      const image = await prepareImage(file);
      if (mine !== token.current) return;
      route({ kind: activeKind, source: { type: 'photo', images: [image] } });
    } catch (e) {
      if (mine !== token.current) return;
      setPhase({ name: 'error', message: plainMessage(e), retry: false, settings: false });
    }
  }

  function answerTrip(same: boolean) {
    const job = picked;
    setPicked(null);
    if (!job) { setPhase(draft ? { name: 'review' } : { name: 'choose' }); return; }
    if (same) { void run(job, draft); return; }
    setParked(job);
    setPhase({ name: 'review' });
  }

  function change(key: string, patch: LinePatch) {
    setDraft(d => (d ? updateLine(d, key, patch, allIngredients) : d));
    setSaveError('');
  }
  function create(key: string, name: string, dimension: Dimension) {
    const ing = makeNewIngredient(name, dimension, allIngredients);
    change(key, { type: 'ingredient', ingredient: ing, isNew: true });
  }

  /** After a save or discard: start the parked photo as its own draft, or leave. */
  function finish(savedText?: string) {
    savingRef.current = false;
    setSaving(false);
    setDraft(null);
    setKind(null);
    setTyped('');
    if (parked) {
      const job = parked;
      setParked(null);
      void run(job, null);
    } else if (savedText) {
      setPhase({ name: 'saved' }); // a stray second tap lands here, not on Today
    } else {
      p.onClose();
    }
  }

  function save() {
    if (!draft || savingRef.current) return; // a second tap while saving does nothing
    const built = buildDraftEvent(draft, allIngredients, p.stock, new Date(), p.timeZone);
    if (!built.ok) { setSaveError(built.message); return; }
    savingRef.current = true;
    setSaving(true);
    p.onSave({ event: built.event, newIngredients: built.newIngredients, toast: built.toast });
    finish(built.toast);
  }

  const methods = (
    <>
      {hasKey ? (
        <>
          <button type="button" className="button-primary snapbig" onClick={() => cameraRef.current?.click()}>
            <CameraIcon /> Take photo
          </button>
          <button type="button" className="button-outline snapbig" onClick={() => galleryRef.current?.click()}>Choose from gallery</button>
        </>
      ) : (
        <div className="panel snapnokey" role="status">
          <p><strong>Reading photos needs your Gemini key.</strong> Add it in Settings, or type your list here instead.</p>
          <button type="button" className="button-tint" onClick={p.onSettings}>Open Settings</button>
        </div>
      )}
      <button type="button" className="button-outline snapbig" onClick={() => setPhase({ name: 'typed', errors: [] })}>Type a list instead</button>
    </>
  );

  if (phase.name === 'review' && draft) {
    return (
      <PhotoReview
        draft={draft}
        ingredients={allIngredients}
        stock={p.stock}
        format={p.format}
        saving={saving}
        error={saveError}
        notice={parked ? 'Your other photo is waiting. It will start its own list when you save or discard this one.' : undefined}
        onChange={change}
        onCreate={create}
        onSave={save}
        onAddPhoto={() => { setKind(null); setNote(''); setPhase({ name: 'choose' }); }}
        onDiscard={() => finish()}
      />
    );
  }

  if (phase.name === 'saved') {
    return (
      <div className="screen form-screen snapscreen">
        <h1 className="title title--sm">Saved</h1>
        <div className="panel snapworking" role="status">
          <p>All saved. You can undo it from the message below.</p>
          <button type="button" className="button-primary" onClick={p.onClose}>Done</button>
        </div>
      </div>
    );
  }

  if (phase.name === 'working') {
    return (
      <div className="screen form-screen snapscreen">
        <h1 className="title title--sm">Snap pantry</h1>
        <div className="panel snapworking" role="status">
          <p>{phase.text}</p>
          <button type="button" className="button-outline" onClick={() => { token.current++; setPhase(draft ? { name: 'review' } : { name: 'choose' }); }}>Cancel</button>
        </div>
      </div>
    );
  }

  if (phase.name === 'trip') {
    return (
      <div className="screen form-screen snapscreen">
        <h1 className="title title--sm">Same shopping trip?</h1>
        <p className="eyebrow">This looks like a different kind of photo from the one you already took. If it is the same shop, I will put it in the same list and not count things twice.</p>
        <div className="choice-grid choice-grid--2">
          <button type="button" className="answer answer--yes" onClick={() => answerTrip(true)}>{p.yesWord}</button>
          <button type="button" className="answer answer--no" onClick={() => answerTrip(false)}>{p.noWord}</button>
        </div>
      </div>
    );
  }

  if (phase.name === 'error') {
    const retryJob = lastJob.current;
    return (
      <div className="screen form-screen snapscreen">
        <h1 className="title title--sm">Snap pantry</h1>
        <div className="panel snaperror" role="alert">
          <p><strong>{phase.message}</strong></p>
          {phase.retry && retryJob && (
            <button type="button" className="button-primary" onClick={() => void run(retryJob.job, retryJob.base)}>Try again</button>
          )}
          {phase.settings && <button type="button" className="button-tint" onClick={p.onSettings}>Open Settings</button>}
          <button type="button" className="button-outline" onClick={() => setPhase({ name: 'typed', errors: [] })}>Type a list instead</button>
          <button type="button" className="button-outline" onClick={() => setPhase(draft ? { name: 'review' } : { name: 'choose' })}>Back</button>
        </div>
      </div>
    );
  }

  if (phase.name === 'typed') {
    return (
      <div className="screen form-screen snapscreen">
        <h1 className="title title--sm">Type a list</h1>
        <p className="eyebrow">One item per line, like "Chicken 500 g" or "Tomatoes 6".</p>
        <textarea
          className="input snaptext"
          aria-label="Your list"
          rows={7}
          placeholder={'Chicken 500 g\nTomatoes 6\nMilk 2 L'}
          value={typed}
          onChange={e => setTyped(e.target.value)}
        />
        {phase.errors.length > 0 && (
          <div className="settings__error" role="alert">
            <ul>{phase.errors.slice(0, 6).map(m => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <div className="snapactions">
          <button type="button" className="button-primary" disabled={!typed.trim() || !activeKind} onClick={() => activeKind && route({ kind: activeKind, source: { type: 'typed', text: typed } })}>Check my list</button>
          <button type="button" className="button-outline" onClick={() => setPhase({ name: 'choose' })}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen form-screen snapscreen">
      <header className="form-screen__head">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={back}>‹</button>
        <h1 className="title title--sm">{adding ? 'Add another photo' : 'Snap pantry'}</h1>
      </header>
      <p className="eyebrow">Gemini only suggests. You check every line before anything is saved.</p>

      {choices.length > 1 && (
        <section aria-labelledby="snap-what">
          <h2 id="snap-what" className="panel__title">What is this photo?</h2>
          <div className="snapkinds">
            {choices.map(c => (
              <button key={c.kind} type="button" className="snapkind" aria-pressed={activeKind === c.kind} onClick={() => { setKind(c.kind); setNote(''); }}>
                <span className="snapkind__label">{c.label}</span>
                <span className="snapkind__hint">{c.hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeKind ? (
        <section className="snapmethods" aria-label="How to add it">{methods}</section>
      ) : (
        <p className="placeholder">Pick what the photo is, then take it.</p>
      )}
      {note && <p className="snapnote" role="status">{note}</p>}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden aria-label="Photo from camera" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); }} />
      <input ref={galleryRef} type="file" accept="image/*" hidden aria-label="Photo from gallery" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); }} />
    </div>
  );
}
