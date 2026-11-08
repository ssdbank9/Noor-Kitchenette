import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CLAUDE_MODEL } from '../claude/client';
import { DEFAULT_COMMAND_CODE_MODEL, DEFAULT_COMMAND_CODE_SEARCH_MODEL } from '../commandcode/client';
import type { KitchenData, MealSlot } from '../domain/types';
import { WORD_PAIRS, wordsFor } from '../domain/words';
import { parseBackup } from '../storage/backup';
import { plainMessage } from '../gemini/errors';
import { lastSearchWhen, readLastSearch } from '../gemini/lastSearch';
import { useGemini } from '../gemini/GeminiContext'; // F52
import { testKey } from '../gemini/photo'; // F52
import { EatOutListPanel } from './EatOutListPanel'; // F83
import { HomeAreaPanel } from './HomeAreaPanel'; // D22 geo
import { StoresPanel } from './StoresPanel'; // D22 stores
import type { ShopPrefs } from '../domain/types'; // D22 stores
import type { SettingsPatchInput } from '../storage/settingsPatch';

type Settings = KitchenData['settings'];

export interface SettingsProps {
  settings: Settings;
  /** true while any sample-pantry entry is still in effect. */
  sampleLoaded: boolean;
  /** Returns the save result when the caller wants to confirm the change reached the phone. */
  onChange: (patch: SettingsPatchInput) => void | Promise<unknown>;
  onLoadSample: () => void;
  onRemoveSample: () => void;
  /** The backup file text for the current kitchen. */
  onExport: () => string;
  /** Replaces the kitchen with a backup already checked by parseBackup. */
  onRestore: (text: string) => Promise<{ ok: true } | { ok: false; errors: string[] }>;
  onBack: () => void;
  shopPrefs: ShopPrefs; // D22 stores
  onShopPrefs: (prefs: ShopPrefs) => void; // D22 stores
}

const SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'chai', label: 'Chai' },
  { id: 'dinner', label: 'Dinner' },
];

/** The Command Code vision models Noor can pick between (D-24). Missing setting = the default. */
const CC_MODELS: { id: string; label: string }[] = [
  { id: 'Qwen/Qwen3.8-Omni-Flash', label: 'Qwen 3.8 Omni' },
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
  { id: 'zai-org/GLM-5.3', label: 'GLM 5.3' },
  { id: 'xiaomi/mimo-v2.6-flash', label: 'MiMo V2.6' },
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
  const { client, dishClient, providerName } = useGemini(); // F52 photo client follows the provider; dishClient is always Gemini
  const [testing, setTesting] = useState(false); // F52
  const [testNote, setTestNote] = useState(''); // F52
  const [ccKeyText, setCcKeyText] = useState(''); // K1NB38
  const [ccShowKey, setCcShowKey] = useState(false); // K1NB38
  const [ccKeyNote, setCcKeyNote] = useState(''); // K1NB38
  const [ccTesting, setCcTesting] = useState(false); // K1NB38
  const [ccTestNote, setCcTestNote] = useState(''); // K1NB38
  const [ccModelText, setCcModelText] = useState(p.settings.commandCodeModel ?? ''); // D-24
  const [ccSearchText, setCcSearchText] = useState(p.settings.commandCodeSearchModel ?? '');
  const [searchTesting, setSearchTesting] = useState(false);
  const [searchTestNote, setSearchTestNote] = useState('');
  const [catalog, setCatalog] = useState<string[] | null>(null);
  const [claudeKeyText, setClaudeKeyText] = useState('');
  const [claudeShowKey, setClaudeShowKey] = useState(false);
  const [claudeKeyNote, setClaudeKeyNote] = useState('');
  const [claudeModelText, setClaudeModelText] = useState(p.settings.claudeModel ?? '');
  const [claudeTesting, setClaudeTesting] = useState(false);
  const [claudeTestNote, setClaudeTestNote] = useState('');

  const hasKey = Boolean(p.settings.geminiKey);
  // Which service reads photos: the provider setting wins; else whichever key exists (K1NB38).
  const provider = p.settings.photoProvider ?? (p.settings.commandCodeKey?.trim() ? 'commandcode' : p.settings.claudeKey?.trim() ? 'claude' : 'gemini');
  const hasCcKey = Boolean(p.settings.commandCodeKey);
  const hasClaudeKey = Boolean(p.settings.claudeKey);

  // The model picker follows the live catalog, so retired models are seen, not discovered
  // at search time. The key never leaves the request header; failures just leave the fields
  // as plain text.
  const ccKey = p.settings.commandCodeKey?.trim();
  useEffect(() => {
    let cancelled = false;
    setCatalog(null);
    if (!ccKey) return;
    void (async () => {
      try {
        const res = await fetch('https://api.commandcode.ai/provider/v1/models', { headers: { authorization: `Bearer ${ccKey}` } });
        if (!res.ok) return;
        const body: unknown = await res.json();
        const list = Array.isArray((body as { data?: unknown[] })?.data) ? (body as { data: unknown[] }).data : [];
        const ids = list
          .map(m => (typeof (m as { id?: unknown })?.id === 'string' ? (m as { id: string }).id : null))
          .filter((x): x is string => Boolean(x));
        if (!cancelled && ids.length) setCatalog(ids);
      } catch { /* plain text fields stay */ }
    })();
    return () => { cancelled = true; };
  }, [ccKey]);
  const savedSearchModel = p.settings.commandCodeSearchModel ?? DEFAULT_COMMAND_CODE_SEARCH_MODEL;
  const searchModelMissing = catalog !== null && !catalog.includes(savedSearchModel);
  const closestModel = catalog?.find(id => id.toLowerCase().startsWith('openai/')) ?? catalog?.[0] ?? '';
  const lastSearch = readLastSearch();

  /** Waits for the write; false when this phone could not save it. */
  async function confirmed(result: void | Promise<unknown>): Promise<boolean> {
    const state = await result;
    return (state as { status?: string } | null | undefined)?.status !== 'error';
  }
  async function saveKey() {
    const trimmed = keyText.trim();
    if (!trimmed) { setKeyNote('Paste your key first.'); return; }
    setKeyNote('Saving...');
    if (!await confirmed(p.onChange({ geminiKey: trimmed }))) {
      setKeyNote('This phone could not save the key. Keep this tab open and try again.');
      return;
    }
    setKeyText('');
    setShowKey(false);
    setKeyNote('Key saved on this phone.');
  }
  // F52: one tiny text request; the key is never shown or logged.
  async function runKeyTest() {
    setTesting(true);
    setTestNote('');
    const r = await testKey(dishClient); // K1NB38: the Gemini/dish key
    setTesting(false);
    setTestNote(r.ok ? 'Key works' : r.message);
  }
  function removeKey() {
    p.onChange({ geminiKey: undefined });
    setKeyText('');
    setKeyNote('Key removed.');
  }
  // K1NB38: Command Code key and model, kept on this phone; backups never carry the key.
  async function saveCcKey() {
    const trimmed = ccKeyText.trim();
    if (!trimmed) { setCcKeyNote('Paste your Command Code key first.'); return; }
    setCcKeyNote('Saving...');
    if (!await confirmed(p.onChange({ commandCodeKey: trimmed }))) {
      setCcKeyNote('This phone could not save the key. Keep this tab open and try again.');
      return;
    }
    setCcKeyText('');
    setCcShowKey(false);
    setCcKeyNote('Command Code key saved on this phone.');
  }
  function removeCcKey() {
    p.onChange({ commandCodeKey: undefined });
    setCcKeyText('');
    setCcKeyNote('Command Code key removed.');
  }
  async function runCcTest() {
    setCcTesting(true);
    setCcTestNote('');
    const r = await testKey(client); // K1NB38: the active photo provider
    setCcTesting(false);
    setCcTestNote(r.ok ? 'Key works' : r.message);
  }
  // D-24: any model id the key can use, typed by hand. Blank means the default.
  function saveCcModel() {
    const trimmed = ccModelText.trim();
    p.onChange({ commandCodeModel: trimmed || undefined });
    setCcKeyNote(trimmed ? `Model set to ${trimmed}.` : 'Using the default model.');
  }
  function saveCcSearchModel() {
    const trimmed = ccSearchText.trim();
    p.onChange({ commandCodeSearchModel: trimmed || undefined });
    setCcKeyNote(trimmed ? `Search model set to ${trimmed}.` : 'Searching uses the model above.');
  }
  /** One tiny real search, so "does searching work?" is answered on the phone, not by guesswork. */
  async function runSearchTest() {
    setSearchTesting(true);
    setSearchTestNote('');
    try {
      const r = await dishClient.generate({
        search: true,
        system: 'Search the web and report only pages you actually found.',
        parts: [{ text: 'Find one recipe web page for "aloo gosht" from Pakistan and give its link.' }],
        maxOutputTokens: 256,
      });
      setSearchTestNote(r.sources.length > 0
        ? `Search works (${r.sources.length} page${r.sources.length === 1 ? '' : 's'} found).`
        : 'The model answered but found no pages. Choose a search model that can search.');
    } catch (error) {
      setSearchTestNote(plainMessage(error));
    } finally {
      setSearchTesting(false);
    }
  }
  async function saveClaudeKey() {
    const trimmed = claudeKeyText.trim();
    if (!trimmed) { setClaudeKeyNote('Paste your Claude key first.'); return; }
    setClaudeKeyNote('Saving...');
    if (!await confirmed(p.onChange({ claudeKey: trimmed }))) {
      setClaudeKeyNote('This phone could not save the key. Keep this tab open and try again.');
      return;
    }
    setClaudeKeyText('');
    setClaudeShowKey(false);
    setClaudeKeyNote('Claude key saved on this phone.');
  }
  function removeClaudeKey() {
    p.onChange({ claudeKey: undefined });
    setClaudeKeyText('');
    setClaudeKeyNote('Claude key removed.');
  }
  function saveClaudeModel() {
    const trimmed = claudeModelText.trim();
    p.onChange({ claudeModel: trimmed || undefined });
    setClaudeKeyNote(trimmed ? `Model set to ${trimmed}.` : 'Using the default model.');
  }
  async function runClaudeTest() {
    setClaudeTesting(true);
    setClaudeTestNote('');
    const r = await testKey(client); // the active photo provider (Claude when this is shown)
    setClaudeTesting(false);
    setClaudeTestNote(r.ok ? 'Key works' : r.message);
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
    if (result.ok) setRestoreNote('Done. This phone now has the saved copy.');
    else setRestoreErrors(result.errors);
  }

  return (
    <div className="screen settings">
      <header className="settings__header">
        <button type="button" className="icon-button icon-button--outlined" aria-label="Back" onClick={p.onBack}>‹</button>
        <h1 className="title title--sm">Settings</h1>
      </header>

      <section className="panel settings__panel" aria-labelledby="set-photo-provider">
        <h2 id="set-photo-provider" className="panel__title">Who reads the photos?</h2>
        <p className="settings__hint">This app can look at a photo and list the food. Pick who does the looking. Right now: {providerName}.</p>
        <div className="settings__buttons" role="group" aria-label="Photo provider">
          <button type="button" className={provider === 'commandcode' ? 'button-primary' : 'button-outline'} aria-pressed={provider === 'commandcode'} onClick={() => p.onChange({ photoProvider: 'commandcode' })}>Command Code</button>
          <button type="button" className={provider === 'claude' ? 'button-primary' : 'button-outline'} aria-pressed={provider === 'claude'} onClick={() => p.onChange({ photoProvider: 'claude' })}>Claude</button>
          <button type="button" className={provider === 'gemini' ? 'button-primary' : 'button-outline'} aria-pressed={provider === 'gemini'} onClick={() => p.onChange({ photoProvider: 'gemini' })}>Gemini</button>
        </div>

        {provider === 'commandcode' && (
          <>
            <div className="settings__keyrow">
              <input
                className="input"
                type={ccShowKey ? 'text' : 'password'}
                aria-label="Command Code secret key"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={hasCcKey ? 'A key is saved' : 'Paste your Command Code key'}
                value={ccKeyText}
                onChange={e => { setCcKeyText(e.target.value); setCcKeyNote(''); }}
              />
              <button type="button" className="button-tint" aria-pressed={ccShowKey} onClick={() => setCcShowKey(v => !v)}>
                {ccShowKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="settings__hint">{hasCcKey ? 'A Command Code key is saved on this phone.' : 'No Command Code key saved yet.'}</p>
            <div className="settings__buttons">
              <button type="button" className="button-primary" onClick={() => void saveCcKey()}>Save key</button>
              <button type="button" className="button-outline" disabled={!hasCcKey} onClick={removeCcKey}>Remove key</button>
            </div>
            <div className="settings__buttons" role="group" aria-label="Photo model">
              {CC_MODELS.map(m => {
                const active = (p.settings.commandCodeModel ?? DEFAULT_COMMAND_CODE_MODEL) === m.id;
                return (
                  <button key={m.id} type="button" className={active ? 'button-primary' : 'button-outline'} aria-pressed={active}
                    onClick={() => {
                      p.onChange({ commandCodeModel: m.id === DEFAULT_COMMAND_CODE_MODEL ? undefined : m.id });
                      setCcModelText(m.id === DEFAULT_COMMAND_CODE_MODEL ? '' : m.id);
                    }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div className="settings__keyrow">
              <input
                className="input"
                type="text"
                aria-label="Command Code model"
                list="cc-models"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={`Any model id (default ${DEFAULT_COMMAND_CODE_MODEL})`}
                value={ccModelText}
                onChange={e => { setCcModelText(e.target.value); setCcKeyNote(''); }}
              />
              <button type="button" className="button-tint" onClick={saveCcModel}>Use this model</button>
            </div>
            <p className="settings__hint">Using: {p.settings.commandCodeModel ?? DEFAULT_COMMAND_CODE_MODEL}. Type any model id your key can use.</p>
            <div className="settings__keyrow">
              <input
                className="input"
                type="text"
                aria-label="Command Code search model"
                list="cc-models"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={`Model for web search (default ${DEFAULT_COMMAND_CODE_SEARCH_MODEL})`}
                value={ccSearchText}
                onChange={e => { setCcSearchText(e.target.value); setCcKeyNote(''); }}
              />
              <button type="button" className="button-tint" onClick={saveCcSearchModel}>Use for search</button>
            </div>
            <p className="settings__hint">Searching uses {savedSearchModel}. Most models ignore the search tool; OpenAI ones honour it. If it cannot, another OpenAI model, then Google Gemini, get a turn.</p>
            <datalist id="cc-models">{(catalog ?? []).map(id => <option key={id} value={id} />)}</datalist>
            {searchModelMissing && (
              <p className="settings__note" role="status">
                {savedSearchModel} is not in your model list.
                {closestModel && (
                  <button type="button" className="button-tint" onClick={() => { p.onChange({ commandCodeSearchModel: closestModel }); setCcSearchText(closestModel); }}>
                    Use {closestModel} instead
                  </button>
                )}
              </p>
            )}
            {lastSearch && (
              <p className="settings__hint">
                Last search: {lastSearchWhen(lastSearch, p.settings.timeZone)} · {lastSearch.ok
                  ? `${lastSearch.via ?? 'search'} — ${lastSearch.pages ?? 0} ${lastSearch.pages === 1 ? 'page' : 'pages'} found`
                  : lastSearch.message ?? 'it did not work'}
              </p>
            )}
            {ccKeyNote && <p className="settings__note" role="status">{ccKeyNote}</p>}
            <div className="settings__buttons">
              <button type="button" className="button-tint" disabled={ccTesting || !hasCcKey} onClick={() => void runCcTest()}>{ccTesting ? 'Testing...' : 'Test my key'}</button>
              <button type="button" className="button-tint" disabled={searchTesting || !hasCcKey} onClick={() => void runSearchTest()}>{searchTesting ? 'Searching...' : 'Test search'}</button>
            </div>
            {ccTestNote && <p className="settings__note" role="status">{ccTestNote}</p>}
            {searchTestNote && <p className="settings__note" role="status">{searchTestNote}</p>}
          </>
        )}

        {provider === 'claude' && (
          <>
            <div className="settings__keyrow">
              <input
                className="input"
                type={claudeShowKey ? 'text' : 'password'}
                aria-label="Claude secret key"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={hasClaudeKey ? 'A key is saved' : 'Paste your Claude key'}
                value={claudeKeyText}
                onChange={e => { setClaudeKeyText(e.target.value); setClaudeKeyNote(''); }}
              />
              <button type="button" className="button-tint" aria-pressed={claudeShowKey} onClick={() => setClaudeShowKey(v => !v)}>
                {claudeShowKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="settings__hint">{hasClaudeKey ? 'A Claude key is saved on this phone.' : 'No Claude key saved yet.'}</p>
            <div className="settings__buttons">
              <button type="button" className="button-primary" onClick={() => void saveClaudeKey()}>Save key</button>
              <button type="button" className="button-outline" disabled={!hasClaudeKey} onClick={removeClaudeKey}>Remove key</button>
            </div>
            <div className="settings__keyrow">
              <input
                className="input"
                type="text"
                aria-label="Claude model"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={`Any model id (default ${DEFAULT_CLAUDE_MODEL})`}
                value={claudeModelText}
                onChange={e => { setClaudeModelText(e.target.value); setClaudeKeyNote(''); }}
              />
              <button type="button" className="button-tint" onClick={saveClaudeModel}>Use this model</button>
            </div>
            <p className="settings__hint">Using: {p.settings.claudeModel ?? DEFAULT_CLAUDE_MODEL}. Type any Claude model id your key can use.</p>
            {claudeKeyNote && <p className="settings__note" role="status">{claudeKeyNote}</p>}
            <div className="settings__buttons">
              <button type="button" className="button-tint" disabled={claudeTesting || !hasClaudeKey} onClick={() => void runClaudeTest()}>{claudeTesting ? 'Testing...' : 'Test my key'}</button>
            </div>
            {claudeTestNote && <p className="settings__note" role="status">{claudeTestNote}</p>}
          </>
        )}

        {provider === 'gemini' && (
          <p className="settings__hint">Photos are read with your Gemini key, below.</p>
        )}
      </section>

      <section className="panel settings__panel" aria-labelledby="set-key">
        <h2 id="set-key" className="panel__title">Google Gemini secret key</h2>
        <p className="settings__hint">Used for photos when the reader above is Gemini, and for searching when Command Code cannot. Stays on this phone. Never in a saved copy.</p>
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
        <p className="settings__hint">{hasKey ? 'A Gemini key is saved on this phone.' : 'No Gemini key saved yet.'}</p>
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={() => void saveKey()}>Save key</button>
          <button type="button" className="button-outline" disabled={!hasKey} onClick={removeKey}>Remove key</button>
        </div>
        {keyNote && <p className="settings__note" role="status">{keyNote}</p>}
        <div className="settings__buttons">
          <button type="button" className="button-tint" disabled={testing} onClick={() => void runKeyTest()}>{testing ? 'Testing...' : 'Test my key'}</button>
        </div>
        {testNote && <p className="settings__note" role="status">{testNote}</p>}
        <p className="settings__hint">Photos are sent to the reader only to be read. Small cut-out pictures of the items stay on this phone until you save or throw away the list.</p>
      </section>

      <section className="panel settings__panel" aria-labelledby="set-words">
        <h2 id="set-words" className="panel__title">How should the app say Yes and No?</h2>
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
        <h2 id="set-people" className="panel__title">How many people usually eat?</h2>
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
            // Only this slot changes, so a stale copy of the others cannot overwrite a second
            // tab's edit to a different slot (GLM N3).
            p.onChange({ slotTimes: { [s.id]: shiftClock(t, minutes) } });
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
        <h2 id="set-sample" className="panel__title">Practice food</h2>
        <p className="settings__hint">Made-up amounts for trying the app. Remove them any time.</p>
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={p.onLoadSample}>Load practice food</button>
          <button type="button" className="button-outline" disabled={!p.sampleLoaded} onClick={p.onRemoveSample}>Remove practice food</button>
        </div>
      </section>

      <HomeAreaPanel homeArea={p.settings.homeArea} onChange={p.onChange} /> {/* D22 geo */}

      <EatOutListPanel timeZone={p.settings.timeZone} /> {/* F83 */}
      <StoresPanel prefs={p.shopPrefs} words={p.settings.words} onChange={p.onShopPrefs} /> {/* D22 stores */}

      <section className="panel settings__panel" aria-labelledby="set-backup">
        <h2 id="set-backup" className="panel__title">Keep everything safe</h2>
        <div className="settings__buttons">
          <button type="button" className="button-primary" onClick={saveBackup}>Save a copy of everything</button>
          <button type="button" className="button-outline" onClick={() => fileRef.current?.click()}>Bring back a saved copy</button>
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
            <strong>That copy could not be used. Nothing was changed.</strong>
            <ul>{restoreErrors.slice(0, 5).map(m => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {restoreText !== null && (
          <div className="settings__confirm" role="alertdialog" aria-label="Confirm restore">
            <p>This puts the saved copy on this phone and removes what is here now. Your keys stay. Do it?</p>
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
