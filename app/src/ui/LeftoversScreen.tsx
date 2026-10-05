import { useState } from 'react';
import { LOCATIONS, locationLabel } from '../domain/batches';
import { applyLeftover, newLeftover, stillHere, suggestedUseBy } from '../domain/leftovers';
import { prettyDate } from '../domain/leftoverUse';
import type { Leftover, StorageLocation } from '../domain/types';

export interface LeftoversScreenProps {
  leftovers: Leftover[];
  /** Household-local today, YYYY-MM-DD. */
  today: string;
  yesWord: string;
  noWord: string;
  onChange: (next: Leftover, previous: Leftover | null, toast: string) => void;
}

type Pending = { id: string; kind: 'used' | 'wasted'; count: number } | null;

const portions = (n: number) => `${n} ${n === 1 ? 'portion' : 'portions'}`;

/** Prepared food kept for later (F65). Using it never touches raw ingredient stock. */
export function LeftoversScreen(p: LeftoversScreenProps) {
  const items = stillHere(p.leftovers).sort((a, b) => b.madeOn.localeCompare(a.madeOn) || a.id.localeCompare(b.id));
  const [pending, setPending] = useState<Pending>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [count, setCount] = useState(2);
  const [where, setWhere] = useState<StorageLocation>('fridge');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const change = (l: Leftover, action: Parameters<typeof applyLeftover>[1]['action'], toast: string, extra: { portions?: number; location?: StorageLocation } = {}) => {
    const now = new Date();
    const next = applyLeftover(l, { action, at: now, localDate: p.today, ...extra });
    if (next !== l) p.onChange(next, l, toast);
    setPending(null);
  };

  function add() {
    const label = name.trim();
    if (!label || count < 1) return;
    const now = new Date();
    p.onChange(newLeftover({ id: `lo-${globalThis.crypto.randomUUID()}`, name: label, portions: count, localDate: p.today, at: now, location: where }), null, `Added ${label}.`);
    setAdding(false); setName(''); setCount(2); setWhere('fridge');
  }

  return (
    <section className="depth" aria-label="Leftovers">
      <p className="depth__note">Leftovers are cooked food. Eating them never takes ingredients out of the pantry again. A "use by" date is only a guide.</p>
      {items.length === 0 && !adding && <p className="placeholder">No leftovers right now. After cooking, say how many portions are left, or add one here.</p>}
      <ul className="rows">
        {items.map(l => {
          const useBy = suggestedUseBy(l);
          const open = pending?.id === l.id ? pending : null;
          return (
            <li key={l.id} className="depth-card" aria-label={l.name}>
              <div className="depth-card__top">
                <h3 className="depth-card__name">{l.name}</h3>
                <span className="depth-card__big" aria-label={`${portions(l.portionsLeft)} left`}><strong>{l.portionsLeft}</strong> left</span>
              </div>
              <p className="depth-card__meta">
                Made {prettyDate(l.madeOn)} · {locationLabel(l.location)}
                {l.frozenOn && l.location === 'freezer' ? ` since ${prettyDate(l.frozenOn)}` : ''}
              </p>
              {useBy && <p className="depth-card__guide">Use by {prettyDate(useBy)} <span>(a guide)</span></p>}
              <div className="depth-chips" role="group" aria-label={`Where ${l.name} is kept`}>
                {LOCATIONS.map(loc => (
                  <button key={loc.id} type="button" className="choice-chip" aria-pressed={l.location === loc.id}
                    onClick={() => l.location !== loc.id && change(l, 'moved', `${l.name} moved to the ${loc.label.toLowerCase()}.`, { location: loc.id })}>{loc.label}</button>
                ))}
              </div>
              {open ? (
                <div className="depth-entry">
                  <p className="depth-entry__prompt">{open.kind === 'used' ? 'How many portions did you eat?' : 'How many portions did you throw away?'}</p>
                  <div className="stepper">
                    <button type="button" aria-label="Fewer portions" onClick={() => setPending({ ...open, count: Math.max(1, open.count - 1) })}>−</button>
                    <output aria-live="polite">{open.count}</output>
                    <button type="button" aria-label="More portions" onClick={() => setPending({ ...open, count: Math.min(l.portionsLeft, open.count + 1) })}>+</button>
                  </div>
                  <div className="depth-actions">
                    <button type="button" className="button-primary" onClick={() => change(l, open.kind, open.kind === 'used'
                      ? `Ate ${portions(open.count)} of ${l.name}. ${l.portionsLeft - open.count} left.`
                      : `Threw away ${portions(open.count)} of ${l.name}.`, { portions: open.count })}>Confirm</button>
                    <button type="button" className="button-outline" onClick={() => setPending(null)}>Cancel</button>
                  </div>
                </div>
              ) : confirmDel === l.id ? (
                <div className="depth-entry">
                  <p className="depth-entry__prompt">Remove {l.name} from the list?</p>
                  <div className="depth-actions">
                    <button type="button" className="button-primary" onClick={() => { setConfirmDel(null); change(l, 'used', `Finished ${l.name}.`, { portions: l.portionsLeft }); }}>{p.yesWord}</button>
                    <button type="button" className="button-outline" onClick={() => setConfirmDel(null)}>{p.noWord}</button>
                  </div>
                </div>
              ) : (
                <div className="depth-actions depth-actions--wrap">
                  <button type="button" className="button-tint" onClick={() => setPending({ id: l.id, kind: 'used', count: 1 })}>Ate some</button>
                  {l.location !== 'freezer' && (
                    <button type="button" className="button-tint" onClick={() => change(l, 'frozen', `${l.name} is in the freezer.`)}>Freeze it</button>
                  )}
                  <button type="button" className="button-tint" onClick={() => setPending({ id: l.id, kind: 'wasted', count: 1 })}>Threw away</button>
                  <button type="button" className="button-tint" onClick={() => setConfirmDel(l.id)}>Finished</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="depth-card">
          <h3 className="depth-card__name">Add a leftover</h3>
          <label className="psheet__field">
            <span>What is it?</span>
            <input type="text" autoComplete="off" value={name} placeholder="e.g. Chicken biryani" onChange={e => setName(e.target.value)} />
          </label>
          <div className="stepper-row panel--inline" aria-label="Portions">
            <span className="stepper-row__label">Portions</span>
            <div className="stepper">
              <button type="button" aria-label="Fewer portions" onClick={() => setCount(n => Math.max(1, n - 1))}>−</button>
              <output aria-live="polite">{count}</output>
              <button type="button" aria-label="More portions" onClick={() => setCount(n => Math.min(30, n + 1))}>+</button>
            </div>
          </div>
          <div className="depth-chips" role="group" aria-label="Where it is kept">
            {LOCATIONS.map(loc => (
              <button key={loc.id} type="button" className="choice-chip" aria-pressed={where === loc.id} onClick={() => setWhere(loc.id)}>{loc.label}</button>
            ))}
          </div>
          <div className="depth-actions">
            <button type="button" className="button-primary" disabled={!name.trim()} onClick={add}>Save leftover</button>
            <button type="button" className="button-outline" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="button-outline depth-add" onClick={() => setAdding(true)}>Add leftover</button>
      )}
    </section>
  );
}
