import { useState } from 'react';
import { LOCATIONS, allocateBatches, buildBatch, locationLabel, type BatchState } from '../domain/batches';
import { addDaysTo } from '../domain/leftovers';
import { prettyDate } from '../domain/leftoverUse';
import type { Balance } from '../domain/ledger';
import { parseAmountText, stepFor, unitsFor } from '../domain/pantryActions';
import type { Batch, Ingredient, StorageLocation } from '../domain/types';
import { fromBase } from '../domain/units';

const trim = (n: number) => String(Math.round(n * 1000) / 1000);

export interface PlaceDatesValue { location: StorageLocation; expiresOn: string; frozenOn: string }

/** Place chips, an expiry date and (in the freezer) a frozen-on date. Shared by "Where and when" and "Bought more". */
export function PlaceDatesFields(p: { value: PlaceDatesValue; onChange: (v: PlaceDatesValue) => void; today: string }) {
  const { value: v, onChange } = p;
  const set = (patch: Partial<PlaceDatesValue>) => onChange({ ...v, ...patch });
  const quick: { label: string; days: number }[] = [
    { label: 'Tomorrow', days: 1 }, { label: 'In 3 days', days: 3 }, { label: 'In a week', days: 7 }, { label: 'In a month', days: 30 },
  ];
  return (
    <>
      <div className="depth-chips" role="group" aria-label="Place">
        {LOCATIONS.map(l => (
          <button key={l.id} type="button" className="choice-chip" aria-pressed={v.location === l.id}
            onClick={() => set({ location: l.id, ...(l.id === 'freezer' && !v.frozenOn ? { frozenOn: p.today } : {}) })}>{l.label}</button>
        ))}
      </div>
      <div className="depth-chips" role="group" aria-label="Expiry quick picks">
        {quick.map(q => (
          <button key={q.label} type="button" className="psheet__chip" onClick={() => set({ expiresOn: addDaysTo(p.today, q.days) })}>{q.label}</button>
        ))}
      </div>
      <label className="psheet__field">
        <span>Expiry date (optional)</span>
        <input type="date" value={v.expiresOn} onChange={e => set({ expiresOn: e.target.value })} />
      </label>
      {v.location === 'freezer' && (
        <label className="psheet__field">
          <span>Frozen on</span>
          <input type="date" value={v.frozenOn} onChange={e => set({ frozenOn: e.target.value })} />
        </label>
      )}
    </>
  );
}

const STATE_TEXT: Record<BatchState, string> = {
  'in-stock': '', partly: 'Partly used', 'may-be-used-up': 'May be used up', check: 'Check stock',
};

export interface BatchesPanelProps {
  ingredient: Ingredient;
  balance: Balance | undefined;
  batches: Batch[];
  today: string;
  yesWord: string;
  noWord: string;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  onSave: (batch: Batch, toast: string) => void;
  onDelete: (batch: Batch) => void;
  onBack: () => void;
}

/** "Where and when" for one ingredient: its batches, with add, edit and delete (F66, F67, F76). */
export function BatchesPanel(p: BatchesPanelProps) {
  const ing = p.ingredient;
  const units = unitsFor(ing);
  const defaultUnit = fromBase(1000, ing).unit;
  const [editing, setEditing] = useState<Batch | 'new' | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState(units.includes(defaultUnit) ? defaultUnit : (units[0] ?? ''));
  const [place, setPlace] = useState<PlaceDatesValue>({ location: 'fridge', expiresOn: '', frozenOn: '' });
  const [pkg, setPkg] = useState('');
  const [pkgUnit, setPkgUnit] = useState(units.includes(defaultUnit) ? defaultUnit : (units[0] ?? ''));
  const [error, setError] = useState('');

  const statuses = allocateBatches(p.batches, p.balance);

  function startEdit(b: Batch | 'new') {
    setError('');
    setEditing(b);
    if (b === 'new') {
      setAmount(''); setPkg(''); setPlace({ location: 'fridge', expiresOn: '', frozenOn: '' });
      return;
    }
    const shown = fromBase(b.amount, ing);
    setAmount(trim(shown.amount)); setUnit(units.includes(shown.unit) ? shown.unit : unit);
    setPkg(b.packageSize ? trim(b.packageSize.amount) : ''); setPkgUnit(b.packageSize?.unit ?? pkgUnit);
    setPlace({ location: b.location, expiresOn: b.expiresOn ?? '', frozenOn: b.frozenOn ?? '' });
  }

  function save() {
    const existing = editing && editing !== 'new' ? editing : null;
    const r = buildBatch({
      id: existing?.id ?? `batch-${globalThis.crypto.randomUUID()}`,
      ingredient: ing, amount: parseAmountText(amount), unit, location: place.location,
      expiresOn: place.expiresOn, frozenOn: place.frozenOn,
      boughtOn: existing?.boughtOn ?? p.today,
      packageAmount: pkg.trim() ? parseAmountText(pkg) ?? NaN : undefined, packageUnit: pkgUnit,
      fromEventId: existing?.fromEventId, note: existing?.note,
    });
    if (!r.ok) { setError(r.message); return; }
    p.onSave(r.batch, existing ? `Updated ${ing.name} batch.` : `Added ${ing.name} batch.`);
    setEditing(null);
  }

  if (editing) {
    return (
      <div className="psheet__entry">
        <p className="psheet__prompt">{editing === 'new' ? 'Add a batch' : 'Edit batch'}</p>
        <div className="psheet__stepper">
          <button type="button" aria-label="Less" onClick={() => { setAmount(trim(Math.max(0, (parseAmountText(amount) ?? 0) - stepFor(unit)))); setError(''); }}>−</button>
          <label className="psheet__exact">
            <span>Amount in this batch</span>
            <input type="text" inputMode="decimal" autoComplete="off" value={amount} placeholder="0" onChange={e => { setAmount(e.target.value); setError(''); }} />
          </label>
          <button type="button" aria-label="More" onClick={() => { setAmount(trim((parseAmountText(amount) ?? 0) + stepFor(unit))); setError(''); }}>+</button>
        </div>
        <label className="psheet__field">
          <span>Unit</span>
          <select aria-label="Batch unit" value={unit} onChange={e => setUnit(e.target.value)}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
        </label>
        <PlaceDatesFields value={place} onChange={setPlace} today={p.today} />
        <div className="depth-pkg">
          <label className="psheet__field">
            <span>Package size, like 5 kg (optional)</span>
            <input type="text" inputMode="decimal" autoComplete="off" aria-label="Package size" value={pkg} onChange={e => setPkg(e.target.value)} />
          </label>
          <select aria-label="Package unit" value={pkgUnit} onChange={e => setPkgUnit(e.target.value)}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
        </div>
        <p className="depth__note">Package size is the size printed on the pack. It is never what is left.</p>
        {error && <p className="psheet__error" role="alert">{error}</p>}
        <div className="psheet__confirm">
          <button type="button" className="button-primary" onClick={save}>Save batch</button>
          <button type="button" className="button-outline" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="psheet__entry">
      <p className="psheet__prompt">Where and when</p>
      {statuses.length === 0 && <p className="depth__note">No batches yet. Add one to say where it is kept and when to use it by. The amount in the pantry does not change.</p>}
      <ul className="rows">
        {[...statuses].reverse().map(({ batch: b, state }) => (
          <li key={b.id} className="depth-card" aria-label={`${ing.name} batch`}>
            <div className="depth-card__top">
              <span className="row__name">{p.format(b.amount, ing)}</span>
              <span className="row__meta">{locationLabel(b.location)}</span>
            </div>
            <p className="depth-card__meta">
              {b.expiresOn ? `Expires ${prettyDate(b.expiresOn)}` : 'No expiry date'}
              {b.frozenOn ? ` · Frozen ${prettyDate(b.frozenOn)}` : ''}
              {b.packageSize ? ` · Package ${b.packageSize.amount} ${b.packageSize.unit}` : ''}
            </p>
            {STATE_TEXT[state] && <span className={`depth-flag depth-flag--${state}`}>{STATE_TEXT[state]}</span>}
            {confirmDel === b.id ? (
              <div className="depth-entry">
                <p className="depth-entry__prompt">Delete this batch?</p>
                <div className="depth-actions">
                  <button type="button" className="button-primary" onClick={() => { setConfirmDel(null); p.onDelete(b); }}>{p.yesWord}</button>
                  <button type="button" className="button-outline" onClick={() => setConfirmDel(null)}>{p.noWord}</button>
                </div>
              </div>
            ) : (
              <div className="depth-actions">
                <button type="button" className="button-tint" onClick={() => startEdit(b)}>Edit</button>
                <button type="button" className="button-tint" onClick={() => setConfirmDel(b.id)}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="psheet__confirm">
        <button type="button" className="button-primary" onClick={() => startEdit('new')}>Add a batch</button>
        <button type="button" className="button-outline" onClick={p.onBack}>Back</button>
      </div>
    </div>
  );
}
