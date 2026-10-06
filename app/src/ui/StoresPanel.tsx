// Settings -> Stores (D-22): add, edit, delete and reset the places Noor buys from.
// No prices or stock are shown. Links open the store's website; whether that opens the
// store's phone app is UNVERIFIED (it depends on the phone and the store).
import { useState } from 'react';
import { DEFAULT_STORES } from '../domain/shopPrefs';
import { removeStore, resetStores, STORE_KIND_LABEL, upsertStore, validateStore, type StoreInput } from '../domain/stores';
import type { ShopPrefs, Store, StoreKind } from '../domain/types';
import { wordsFor, type WordsId } from '../domain/words';

export interface StoresPanelProps {
  prefs: ShopPrefs;
  /** Settings' yes/no words. */
  words: WordsId | undefined;
  /** Called with the whole new prefs; the caller saves the changed fields (shopPrefsPatch + setBase). */
  onChange: (prefs: ShopPrefs) => void;
}

const KINDS: StoreKind[] = ['online-search', 'copy-list', 'maps-only'];
type Form = Required<Pick<StoreInput, 'name' | 'kind' | 'searchUrl' | 'openUrl' | 'mapsQuery'>> & { id?: string; note?: string; unverified?: boolean };
const blank = (): Form => ({ name: '', kind: 'online-search', searchUrl: '', openUrl: '', mapsQuery: '' });
const formOf = (s: Store): Form => ({ id: s.id, name: s.name, kind: s.kind, searchUrl: s.searchUrl ?? '', openUrl: s.openUrl ?? '', mapsQuery: s.mapsQuery ?? '', note: s.note, unverified: s.unverified });

export function StoresPanel({ prefs, words: wordsId, onChange }: StoresPanelProps) {
  const words = wordsFor(wordsId);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [note, setNote] = useState('');

  function save() {
    if (!form) return;
    const original = form.id ? prefs.stores.find(s => s.id === form.id) : undefined;
    // A link Noor changed is no longer the one that was flagged unconfirmed.
    const keepFlag = original && original.searchUrl === form.searchUrl.trim();
    const r = validateStore({ ...form, unverified: keepFlag ? form.unverified : false }, prefs.stores);
    if (!r.ok) { setErrors(r.errors); return; }
    onChange(upsertStore(prefs, r.store));
    setNote(original ? `${r.store.name} saved.` : `${r.store.name} added.`);
    setForm(null);
    setErrors([]);
  }
  const set = (patch: Partial<Form>) => { setForm(f => (f ? { ...f, ...patch } : f)); setErrors([]); };
  const toDelete = prefs.stores.find(s => s.id === deleting);

  return (
    <section className="panel settings__panel" aria-labelledby="set-stores">
      <h2 id="set-stores" className="panel__title">Stores</h2>
      <p className="settings__hint">Prices and stock are not shown. Links open the store's website; they may open its app on your phone.</p>

      <ul className="stores-list">
        {prefs.stores.map(s => (
          <li key={s.id} className="stores-list__item">
            <div className="stores-list__text">
              <strong>{s.name}</strong>
              <span className="stores-list__kind">{STORE_KIND_LABEL[s.kind]}</span>
            </div>
            <div className="stores-list__buttons">
              <button type="button" className="button-tint" aria-label={`Edit ${s.name}`} onClick={() => { setForm(formOf(s)); setErrors([]); setNote(''); setDeleting(null); }}>Edit</button>
              <button type="button" className="button-tint" aria-label={`Delete ${s.name}`} onClick={() => { setDeleting(s.id); setNote(''); }}>Delete</button>
            </div>
          </li>
        ))}
        {prefs.stores.length === 0 && <li className="settings__hint">No stores yet.</li>}
      </ul>

      {toDelete && (
        <div className="settings__confirm" role="alertdialog" aria-label={`Delete ${toDelete.name}`}>
          <p>Delete {toDelete.name}? Items set to buy there go back to "Any store".</p>
          <div className="choice-grid choice-grid--2">
            <button type="button" className="answer answer--yes" onClick={() => { onChange(removeStore(prefs, toDelete.id)); setNote(`${toDelete.name} deleted.`); setDeleting(null); }}>{words.yes}</button>
            <button type="button" className="answer answer--no" onClick={() => setDeleting(null)}>{words.no}</button>
          </div>
        </div>
      )}

      {form ? (
        <div className="store-form" role="group" aria-label={form.id ? 'Edit store' : 'Add a store'}>
          <label className="psheet__field">Store name
            <input className="input" aria-label="Store name" value={form.name} maxLength={60} onChange={e => set({ name: e.target.value })} />
          </label>
          <div className="settings__chips" role="group" aria-label="What this store does">
            {KINDS.map(k => (
              <button key={k} type="button" className="choice-chip" aria-pressed={form.kind === k} onClick={() => set({ kind: k })}>{STORE_KIND_LABEL[k]}</button>
            ))}
          </div>
          {form.kind === 'online-search' && (
            <label className="psheet__field">Search link (https, with {'{q}'} where the item name goes)
              <input className="input" aria-label="Search link" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="https://store.pk/search?q={q}" value={form.searchUrl} onChange={e => set({ searchUrl: e.target.value })} />
            </label>
          )}
          {form.kind === 'copy-list' && (
            <label className="psheet__field">Link to open after copying (https)
              <input className="input" aria-label="Link to open" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="https://store.pk/" value={form.openUrl} onChange={e => set({ openUrl: e.target.value })} />
            </label>
          )}
          <label className="psheet__field">{form.kind === 'maps-only' ? 'What to look for on the map' : 'What to look for on the map (optional, gives a Directions button)'}
            <input className="input" aria-label="Map search" placeholder="grocery store near I-8 Markaz" value={form.mapsQuery} onChange={e => set({ mapsQuery: e.target.value })} />
          </label>
          {errors.length > 0 && (
            <div className="settings__error" role="alert">
              <strong>This store was not saved.</strong>
              <ul>{errors.map(m => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          <div className="settings__buttons">
            <button type="button" className="button-primary" onClick={save}>Save store</button>
            <button type="button" className="button-outline" onClick={() => { setForm(null); setErrors([]); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={() => { setForm(blank()); setErrors([]); setNote(''); setDeleting(null); }}>Add a store</button>
          <button type="button" className="button-outline" onClick={() => { setResetting(true); setNote(''); }}>Reset to the usual stores</button>
        </div>
      )}

      {resetting && (
        <div className="settings__confirm" role="alertdialog" aria-label="Reset stores">
          <p>Put back Al-Fatah, pandamart, Carrefour and the local shops? Stores you added are removed.</p>
          <div className="choice-grid choice-grid--2">
            <button type="button" className="answer answer--yes" onClick={() => { onChange(resetStores(prefs, DEFAULT_STORES)); setNote('Back to the usual stores.'); setResetting(false); }}>{words.yes}</button>
            <button type="button" className="answer answer--no" onClick={() => setResetting(false)}>{words.no}</button>
          </div>
        </div>
      )}
      {note && <p className="settings__note" role="status">{note}</p>}
    </section>
  );
}
