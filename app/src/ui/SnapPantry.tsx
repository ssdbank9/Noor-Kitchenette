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
  withGuesses,
  type Draft,
  type LinePatch,
} from '../domain/photoDraft';
import type { Dimension, Ingredient, KitchenEvent } from '../domain/types';
import { useGemini } from '../gemini/GeminiContext';
import { parseQuantityLine } from '../domain/units';
import type { PhotoKind } from '../gemini/drafts';
import { isGeminiError, plainMessage } from '../gemini/errors';
import type { PreparedImage } from '../gemini/photo';
import { prepareImage, readPhoto } from '../gemini/photo';
import { suggestMatches } from '../gemini/suggest';
import { cropThumb } from '../gemini/thumbs';
import { clearSnapDraft, loadSnapDraft, saveSnapDraft } from '../storage/snapDraftStore';
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
  | { name: 'leave' } // back from the review: keep the list for later or throw it away
  | { name: 'error'; message: string; retry: boolean; settings: boolean }
  | { name: 'review' }
  | { name: 'saved' };

const KIND_CHOICES: { kind: PhotoKind; label: string; hint: string }[] = [
  { kind: 'groceries', label: 'New groceries', hint: 'Things I just bought' },
  { kind: 'receipt', label: 'Shopping receipt', hint: 'The paper from the shop' },
  { kind: 'pantry', label: 'Check my pantry or fridge', hint: 'What is left on the shelf' },
];

/**
 * A smooth estimate while a photo is read. A web request gives no true progress bit, so this
 * eases toward 95% and stops, and the real answer (review or error) replaces it — it never
 * claims to be done early.
 */
function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setProgress(Math.min(95, Math.round(100 * (1 - Math.exp(-seconds / 18)))));
    }, 120);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="snapprogress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Reading progress">
      <div className="snapprogress__track"><div className="snapprogress__bar" style={{ width: `${progress}%` }} /></div>
      <span className="snapprogress__num">{progress}%</span>
    </div>
  );
}

export function SnapPantry(p: SnapPantryProps) {
  const { client, hasKey, provider, providerName, photoModel } = useGemini();
  // A reading kept from before a reload (the phone browser discards the page under memory
  // pressure): restore it so the review is not lost. The photo itself is never kept.
  const [restored] = useState(() => loadSnapDraft());
  const [phase, setPhase] = useState<Phase>(restored ? { name: 'review' } : { name: 'choose' });
  const [kind, setKind] = useState<PhotoKind | null>(null);
  const [draft, setDraft] = useState<Draft | null>(restored);
  const [typedInput, setTypedInput] = useState('');
  const [typedInputError, setTypedInputError] = useState('');
  const [typedList, setTypedList] = useState<{ id: number; text: string; label: string; amountText: string }[]>([]);
  const typedId = useRef(0);
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

  // Keep the reading (text only) so a page reload does not lose it; clear it once it is gone.
  useEffect(() => {
    if (draft) saveSnapDraft(draft);
    else clearSnapDraft();
  }, [draft]);

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

  function apply(base: Draft | null, job: Job, lines: ReturnType<typeof linesFromPhoto>, readNote: string): Draft {
    const d = base ?? newDraft(job.kind);
    const merged = addSource(d, job.kind, lines, job.source.type, readNote, [...p.ingredients, ...d.lines.flatMap(l => (l.newIngredient ? [l.newIngredient] : []))]);
    lastJob.current = null;
    setDraft(merged);
    setNote('');
    setSaveError('');
    setPhase({ name: 'review' });
    return merged;
  }

  /** One batched guess for lines that matched nothing of Noor's. Silent when it fails. */
  function guessUnmatched(merged: Draft, known: Ingredient[], mine: number) {
    const unmatched = merged.lines.filter(l => !l.ingredientId && !l.newIngredient);
    if (unmatched.length === 0) return;
    const knownNames = known.map(i => i.name);
    void suggestMatches(client, unmatched.map(l => l.label), knownNames).then(g => {
      if (mine !== token.current) return; // cancelled or a newer read finished
      setDraft(d => {
        if (!d) return d;
        const byKey: Record<string, string[]> = {};
        for (const l of d.lines) if (g[l.label]) byKey[l.key] = g[l.label];
        return withGuesses(d, byKey);
      });
    }).catch(() => { /* the ranked local matches still show */ });
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
        // The model read the photo but found nothing: show its own note, so a bad model or
        // photo is obvious rather than mysterious (real-phone finding).
        const why = result.note ? ` ${providerName} said: "${result.note}".` : '';
        setPhase({ name: 'error', message: `I could not find anything to read in that photo.${why} Try a clearer one, or type a list.`, retry: false, settings: false });
        return;
      }
      // Cut each item's picture out of the photo once, right after the read: the crops ride
      // along on the lines (and in the recovery copy), so the review never depends on the
      // photo still being in memory (D-20: the full photo is never kept).
      const [image] = job.source.images;
      const lines = linesFromPhoto(result.items, job.kind, sourceNo, known);
      const withThumbs = await Promise.all(lines.map(async l => ({ ...l, thumb: (await cropThumb(image, l.box)) ?? undefined })));
      const merged = apply(base, job, withThumbs, result.note);
      guessUnmatched(merged, known, mine);
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

  /**
   * Typed-list entry (T7JSD8): one item per Enter. Each line is parsed at once so a typo is
   * caught before it reaches the review; paste several lines and each is tried separately.
   * `amountText` is the parsed preview shown beside the item.
   */
  function addTypedItems(text: string) {
    const parts = text.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    const bad: string[] = [];
    const good: { id: number; text: string; label: string; amountText: string }[] = [];
    for (const line of parts) {
      const parsed = parseQuantityLine(line);
      if ('error' in parsed) { bad.push(`"${line}" — ${parsed.error}`); continue; }
      const q = parsed.quantity;
      good.push({ id: ++typedId.current, text: line, label: parsed.name, amountText: q.amount === null ? '' : `${q.amount} ${q.unit}` });
    }
    if (good.length) { setTypedList(prev => [...prev, ...good]); setTypedInput(''); }
    setTypedInputError(bad.join(' '));
  }
  function removeTyped(id: number) { setTypedList(prev => prev.filter(i => i.id !== id)); }
  function checkTyped() {
    if (!activeKind || typedList.length === 0) return;
    route({ kind: activeKind, source: { type: 'typed', text: typedList.map(i => i.text).join('\n') } });
  }

  /** After a save or discard: start the parked photo as its own draft, or leave. */
  function finish(savedText?: string) {
    savingRef.current = false;
    setSaving(false);
    setDraft(null);
    // Clear the recovery copy now, not via the draft effect: a discard closes this screen in
    // the same commit, the effect never runs, and the "discarded" list would come back on
    // the next visit (the real-phone "it won't let me discard" finding).
    clearSnapDraft();
    setKind(null);
    setTypedList([]);
    setTypedInput('');
    setTypedInputError('');
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
          <p><strong>Reading photos needs your {provider === 'commandcode' ? 'Command Code' : 'Gemini'} key.</strong> Add it in Settings, or type your list here instead.</p>
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
        yesWord={p.yesWord}
        readerName={providerName}
        notice={parked ? 'Your other photo is waiting. It will start its own list when you save or discard this one.'
          : restored ? 'This is the list from your earlier photo — save it, or throw it away with Discard.' : undefined}
        onChange={change}
        onCreate={create}
        onSave={save}
        onBack={() => setPhase({ name: 'leave' })}
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
          <p className="eyebrow">{providerName} · {photoModel}</p>
          <ReadingProgress />
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
        <div className="snapactions">
          <button type="button" className="button-outline" onClick={() => { setPicked(null); setPhase(draft ? { name: 'review' } : { name: 'choose' }); }}>
            Forget this photo
          </button>
        </div>
      </div>
    );
  }

  if (phase.name === 'leave') {
    return (
      <div className="screen form-screen snapscreen">
        <h1 className="title title--sm">Leave this list?</h1>
        <p className="eyebrow">Nothing is saved yet. You can throw the whole list away, or keep it and finish it later.</p>
        <div className="snapactions">
          <button type="button" className="button-primary" onClick={() => finish()}>Throw it away</button>
          <button type="button" className="button-tint" onClick={p.onClose}>Keep it for later</button>
          <button type="button" className="button-outline" onClick={() => setPhase({ name: 'review' })}>Stay on the list</button>
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
        <p className="eyebrow">Type an item with its amount, press Enter. Examples: Chicken 1 kg, Milk 2 L, Eggs 12 (a dozen), Daal 1 g (grams).</p>
        <form className="snapform" onSubmit={e => { e.preventDefault(); addTypedItems(typedInput); }}>
          <div className="settings__keyrow">
            <input
              className="input"
              autoFocus
              aria-label="Your list"
              aria-invalid={typedInputError ? true : undefined}
              placeholder="Chicken 1 kg"
              autoComplete="off"
              autoCapitalize="off"
              value={typedInput}
              onChange={e => { setTypedInput(e.target.value); setTypedInputError(''); }}
            />
            <button type="submit" className="button-primary" disabled={!typedInput.trim()}>Add</button>
          </div>
        </form>
        {typedInputError && <p className="settings__error" role="alert">{typedInputError}</p>}
        {typedList.length > 0 && (
          <ul className="typedlist" aria-label="Items you entered">
            {typedList.map(item => (
              <li key={item.id} className="typedlist__row">
                <span className="typedlist__name">{item.label}</span>
                <span className="typedlist__amount">{item.amountText || 'no amount'}</span>
                <button type="button" className="typedlist__remove" aria-label={`Remove ${item.label}`} onClick={() => removeTyped(item.id)}>×</button>
              </li>
            ))}
          </ul>
        )}
        <p className="snapnote">Amounts: kg, g · L, ml · pc (pieces) · dozen · packet · bunch · tsp, tbsp, cup, pao · or a plain number for pieces. Anything written wrongly shows its error above and can be fixed.</p>
        {phase.errors.length > 0 && (
          <div className="settings__error" role="alert">
            <ul>{phase.errors.slice(0, 6).map(m => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <div className="snapactions">
          <button type="button" className="button-primary" disabled={typedList.length === 0 || !activeKind} onClick={checkTyped}>Check my list</button>
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
      <p className="eyebrow">{providerName} suggests, you check every line. Reading with <strong>{providerName} · {photoModel}</strong> — change it in Settings.</p>

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
