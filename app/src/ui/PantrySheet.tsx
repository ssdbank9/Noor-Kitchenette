import { useState } from 'react';
import type { Balance } from '../domain/ledger';
import {
  ACTION_LABEL,
  buildPantryEvent,
  parseAmountText,
  quickAmounts,
  stepFor,
  unitsFor,
  type PantryActionKind,
} from '../domain/pantryActions';
import type { Ingredient, KitchenEvent } from '../domain/types';

export interface PantrySheetProps {
  ingredient: Ingredient;
  balance: Balance | undefined;
  /** Text for the current amount: "2 kg", "not sure", "check stock", "none"... */
  currentText: string;
  onClose: () => void;
  onApply: (event: KitchenEvent, toast: string) => void;
}

const ACTIONS: PantryActionKind[] = ['bought', 'checked', 'used', 'finished', 'threw'];
const PROMPT: Record<PantryActionKind, string> = {
  bought: 'How much did you buy?',
  checked: 'How much is left?',
  used: 'How much did you use?',
  finished: 'None left?',
  threw: 'How much did you throw away?',
};

const trim = (n: number) => String(Math.round(n * 1000) / 1000);

/** Bottom sheet with the five pantry actions for one ingredient (F56). */
export function PantrySheet({ ingredient, balance, currentText, onClose, onApply }: PantrySheetProps) {
  const [action, setAction] = useState<PantryActionKind | null>(null);
  const units = unitsFor(ingredient);
  const chips = quickAmounts(ingredient);
  const [unit, setUnit] = useState(chips[0]?.unit ?? units[0] ?? '');
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const choose = (a: PantryActionKind) => { setAction(a); setError(''); setText(''); };

  function nudge(dir: 1 | -1) {
    const current = parseAmountText(text) ?? 0;
    setText(trim(Math.max(0, current + dir * stepFor(unit))));
    setError('');
  }

  function confirm(amount: number | null) {
    if (!action) return;
    let priceRs: number | undefined;
    if (action === 'bought' && price.trim()) {
      const p = parseAmountText(price);
      if (p === null) { setError('Price must be a number, like 250.'); return; }
      priceRs = p;
    }
    const result = buildPantryEvent({ action, ingredient, amount, unit, instant: new Date(), priceRs, current: balance });
    if (!result.ok) { setError(result.message); return; }
    onApply(result.event, result.toast);
  }

  const parsed = parseAmountText(text);
  const needsAmount = action && action !== 'finished';

  return (
    <div className="psheet" role="presentation">
      <button type="button" className="psheet__backdrop" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div className="psheet__panel" role="dialog" aria-modal="true" aria-label={ingredient.name}>
        <div className="psheet__head">
          <div>
            <h2 className="psheet__name">{ingredient.name}</h2>
            <p className="psheet__now">Now: <strong>{currentText}</strong></p>
          </div>
          <button type="button" className="psheet__close" onClick={onClose}>Close</button>
        </div>

        {!action && (
          <div className="psheet__actions">
            {ACTIONS.map(a => (
              <button key={a} type="button" className={`psheet__action psheet__action--${a}`} onClick={() => choose(a)}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        )}

        {action && (
          <div className="psheet__entry">
            <p className="psheet__prompt">{ACTION_LABEL[action]}: {PROMPT[action]}</p>

            {needsAmount && (
              <>
                <div className="psheet__stepper">
                  <button type="button" aria-label="Less" onClick={() => nudge(-1)}>−</button>
                  <label className="psheet__exact">
                    <span>Exact amount</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={text}
                      placeholder="0"
                      onChange={e => { setText(e.target.value); setError(''); }}
                    />
                  </label>
                  <button type="button" aria-label="More" onClick={() => nudge(1)}>+</button>
                </div>

                <div className="psheet__chips" role="group" aria-label="Quick amounts">
                  {chips.map(c => (
                    <button
                      key={`${c.amount} ${c.unit}`}
                      type="button"
                      className="psheet__chip"
                      onClick={() => { setText(String(c.amount)); setUnit(c.unit); setError(''); }}
                    >
                      {c.amount} {c.unit}
                    </button>
                  ))}
                </div>

                <label className="psheet__field">
                  <span>Unit</span>
                  <select value={unit} onChange={e => { setUnit(e.target.value); setError(''); }}>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>

                {action === 'bought' && (
                  <label className="psheet__field">
                    <span>Price in Rs (optional)</span>
                    <input type="text" inputMode="decimal" autoComplete="off" value={price} onChange={e => { setPrice(e.target.value); setError(''); }} />
                  </label>
                )}
              </>
            )}

            {error && <p className="psheet__error" role="alert">{error}</p>}

            <div className="psheet__confirm">
              <button
                type="button"
                className="button-primary"
                disabled={needsAmount ? parsed === null : false}
                onClick={() => confirm(needsAmount ? parsed : null)}
              >
                Confirm
              </button>
              {action === 'checked' && (
                <button type="button" className="button-outline" onClick={() => confirm(null)}>Not sure</button>
              )}
              <button type="button" className="button-outline" onClick={() => { setAction(null); setError(''); }}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
