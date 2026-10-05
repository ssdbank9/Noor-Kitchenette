// Settings panel for the restaurant list (F84). The list is a refreshable cache kept in this
// phone's localStorage: it is not part of backups. A malformed file shows a plain error and
// changes nothing.
import { useEffect, useRef, useState } from 'react';
import { clearImported, formatListDate, isOld, loadEatOutList, parseEatOutText, pickNewest, fetchShipped, saveImported, type LoadedList } from '../domain/eatout';

export function EatOutListPanel({ timeZone }: { timeZone: string }) {
  const [state, setState] = useState<LoadedList | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => loadEatOutList().then(setState);
  useEffect(() => { void refresh(); }, []);

  async function chooseFile(file: File | undefined) {
    setError('');
    setNote('');
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('That file could not be read. Nothing was changed.');
      return;
    }
    const r = parseEatOutText(text);
    if (!r.ok) { setError(`${r.error} Nothing was changed.`); return; }
    if (!saveImported(r.list)) { setError('This phone would not keep the list. Nothing was changed.'); return; }
    const shipped = await fetchShipped();
    const used = pickNewest(shipped, r.list);
    setNote(used === r.list ? 'Restaurant list loaded.' : 'Loaded, but the list that came with the app is newer, so that one is used.');
    await refresh();
    if (fileRef.current) fileRef.current.value = '';
  }

  async function remove() {
    clearImported();
    setError('');
    setNote('Removed the loaded list.');
    await refresh();
  }

  const list = state?.list ?? null;
  return (
    <section className="panel settings__panel" aria-labelledby="set-eatout">
      <h2 id="set-eatout" className="panel__title">Restaurant list</h2>
      <p className="settings__hint">
        {state === null ? 'Checking...' : list
          ? `Updated ${formatListDate(list.generatedAt, timeZone)}${state.origin === 'shipped' ? ' (came with the app)' : ' (loaded here)'}.${isOld(list.generatedAt, new Date()) ? ' This list is old.' : ''}`
          : 'No list loaded. Eat out still works with your favourites.'}
      </p>
      <div className="settings__buttons">
        <button type="button" className="button-primary" onClick={() => fileRef.current?.click()}>Load a restaurant list file</button>
        <button type="button" className="button-outline" disabled={state?.origin !== 'imported'} onClick={() => void remove()}>Remove loaded list</button>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" aria-label="Restaurant list file" className="settings__file"
        onChange={e => void chooseFile(e.target.files?.[0])} />
      {error && <div className="settings__error" role="alert">{error}</div>}
      {note && <p className="settings__note" role="status">{note}</p>}
    </section>
  );
}
