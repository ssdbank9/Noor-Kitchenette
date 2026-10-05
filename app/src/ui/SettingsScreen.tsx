import { useRef, useState } from 'react';
import type { KitchenData, MealSlot } from '../domain/types';
import { WORD_PAIRS, wordsFor } from '../domain/words';
import { parseBackup } from '../storage/backup';
import { useGemini } from '../gemini/GeminiContext'; // F52
import { testKey } from '../gemini/photo'; // F52
import { EatOutListPanel } from './EatOutListPanel'; // F83

type Settings = KitchenData['settings'];

export interface SettingsProps {
  settings: Settings;
  /** true while any sample-pantry entry is still in effect. */
  sampleLoaded: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onLoadSample: () => void;
  onRemoveSample: () => void;
  /** The backup file text for the current kitchen. */
  onExport: () => string;
  /** Replaces the kitchen with a backup already checked by parseBackup. */
  onRestore: (text: string) => Promise<{ ok: true } | { ok: false; errors: string[] }>;
  onBack: () => void;
}

const SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'chai', label: 'Chai' },
  { id: 'dinner', label: 'Dinner' },
];

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** hh:mm moved by `minutes`, wrapping around midnight. */
export function shiftClock(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function SettingsScreen(p: SettingsProps) {
  const words = wordsFor(p.settings.words);
  const [keyText, setKeyText] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyNote, setKeyNote] = useState('');
  const [restoreErrors, setRestoreErrors] = useState<string[]>([]);
  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { client } = useGemini(); // F52
  const [testing, setTesting] = useState(false); // F52
  const [testNote, setTestNote] = useState(''); // F52

  const hasKey = Boolean(p.settings.geminiKey);

  function saveKey() {
    const trimmed = keyText.trim();
    if (!trimmed) { setKeyNote('Paste your key first.'); return; }
    p.onChange({ geminiKey: trimmed });
    setKeyText('');
    setShowKey(false);
    setKeyNote('Key saved on this phone.');
  }
  // F52: one tiny text request; the key is never shown or logged.
  async function runKeyTest() {
    setTesting(true);
    setTestNote('');
    const r = await testKey(client);
    setTesting(false);
    setTestNote(r.ok ? 'Key works' : r.message);
  }
  function removeKey() {
    p.onChange({ geminiKey: undefined });
    setKeyText('');
    setKeyNote('Key removed.');
  }

  function saveBackup() {
    const text = p.onExport();
    const day = new Date().toLocaleDateString('en-CA', { timeZone: p.settings.timeZone });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `noors-kitchen-backup-${day}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setRestoreNote('Backup saved. The Gemini key is not in it.');
  }

  async function chooseFile(file: File | undefined) {
    setRestoreErrors([]);
    setRestoreNote('');
    setRestoreText(null);
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRestoreErrors(['That file could not be read.']);
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) { setRestoreErrors(parsed.errors); return; }
    setRestoreText(text);
  }

  async function confirmRestore() {
    if (restoreText === null) return;
    setBusy(true);
    const result = await p.onRestore(restoreText);
    setBusy(false);
    setRestoreText(null);
    if (fileRef.current) fileRef.current.value = '';
    if (result.ok) setRestoreNote('Restored. Your kitchen is now the one in the backup.');
    else setRestoreErrors(result.errors);
  }

  return (
    <div className="screen settings">
      <header className="settings__header">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <h1 className="title title--sm">Settings</h1>
      </header>

      <section className="panel settings__panel" aria-labelledby="set-key">
        <h2 id="set-key" className="panel__title">Gemini key</h2>
        <p className="settings__hint">Stays on this phone. Not included in backups.</p>
        <div className="settings__keyrow">
          <input
            className="input"
            type={showKey ? 'text' : 'password'}
            aria-label="Gemini key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={hasKey ? 'A key is saved' : 'Paste your key'}
            value={keyText}
            onChange={e => { setKeyText(e.target.value); setKeyNote(''); }}
          />
          <button type="button" className="button-tint" aria-pressed={showKey} onClick={() => setShowKey(v => !v)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={saveKey}>Save key</button>
          <button type="button" className="button-outline" disabled={!hasKey} onClick={removeKey}>Remove key</button>
        </div>
        {keyNote && <p className="settings__note" role="status">{keyNote}</p>}
        <div className="settings__buttons">
          <button type="button" className="button-tint" disabled={testing} onClick={() => void runKeyTest()}>{testing ? 'Testing...' : 'Test my key'}</button>
        </div>
        {testNote && <p className="settings__note" role="status">{testNote}</p>}
        <p className="settings__hint">Photos are sent to Google to be read and are not saved in the app.</p>
      </section>

      <section className="panel settings__panel" aria-labelledby="set-words">
        <h2 id="set-words" className="panel__title">Yes / No words</h2>
        <div className="settings__chips">
          {WORD_PAIRS.map(w => (
            <button key={w.id} type="button" className="choice-chip" aria-pressed={w.id === words.id}
              onClick={() => p.onChange({ words: w.id })}>
              {w.yes} / {w.no}
            </button>
          ))}
        </div>
      </section>

      <section className="panel settings__panel" aria-labelledby="set-people">
        <h2 id="set-people" className="panel__title">People usually eating</h2>
        <div className="stepper">
          <button type="button" aria-label="Fewer people usually eating"
            onClick={() => p.onChange({ defaultServings: Math.max(1, p.settings.defaultServings - 1) })}>−</button>
          <output aria-live="polite" aria-label="People usually eating">{p.settings.defaultServings}</output>
          <button type="button" aria-label="More people usually eating"
            onClick={() => p.onChange({ defaultServings: Math.min(30, p.settings.defaultServings + 1) })}>+</button>
        </div>
      </section>

      <section className="panel settings__panel" aria-labelledby="set-times">
        <h2 id="set-times" className="panel__title">Meal times</h2>
        {SLOTS.map(s => {
          const t = p.settings.slotTimes[s.id];
          const move = (minutes: number) =>
            p.onChange({ slotTimes: { ...p.settings.slotTimes, [s.id]: shiftClock(t, minutes) } });
          return (
            <div key={s.id} className="settings__time">
              <span className="settings__time-label">{s.label}</span>
              <div className="stepper">
                <button type="button" aria-label={`${s.label} 15 minutes earlier`} onClick={() => move(-15)}>−</button>
                <output aria-label={`${s.label} time`}>{to12h(t)}</output>
                <button type="button" aria-label={`${s.label} 15 minutes later`} onClick={() => move(15)}>+</button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel settings__panel" aria-labelledby="set-sample">
        <h2 id="set-sample" className="panel__title">Sample pantry</h2>
        <p className="settings__hint">Made-up amounts for trying the app. Remove them any time.</p>
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={p.onLoadSample}>Load sample pantry</button>
          <button type="button" className="button-outline" disabled={!p.sampleLoaded} onClick={p.onRemoveSample}>Remove sample pantry</button>
        </div>
      </section>

      <EatOutListPanel timeZone={p.settings.timeZone} /> {/* F83 */}

      <section className="panel settings__panel" aria-labelledby="set-backup">
        <h2 id="set-backup" className="panel__title">Backup</h2>
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={saveBackup}>Save a backup</button>
          <button type="button" className="button-outline" onClick={() => fileRef.current?.click()}>Restore from backup</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          className="settings__file"
          onChange={e => void chooseFile(e.target.files?.[0])}
        />
        {restoreErrors.length > 0 && (
          <div className="settings__error" role="alert">
            <strong>That backup could not be used. Nothing was changed.</strong>
            <ul>{restoreErrors.slice(0, 5).map(m => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {restoreText !== null && (
          <div className="settings__confirm" role="alertdialog" aria-label="Confirm restore">
            <p>This replaces everything on this phone with the backup. Your Gemini key stays. Go ahead?</p>
            <div className="choice-grid choice-grid--2">
              <button type="button" className="answer answer--yes" disabled={busy} onClick={() => void confirmRestore()}>{words.yes}</button>
              <button type="button" className="answer answer--no" disabled={busy} onClick={() => { setRestoreText(null); if (fileRef.current) fileRef.current.value = ''; }}>{words.no}</button>
            </div>
          </div>
        )}
        {restoreNote && <p className="settings__note" role="status">{restoreNote}</p>}
      </section>
    </div>
  );
}
