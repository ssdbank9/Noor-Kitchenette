// The item's preferred store (D-22). Shows the store or "Any store"; a tap opens a small
// sheet to choose another store or none. This is the only place that edits prefs.preferred.
import { useState } from 'react';
import type { ShopPrefs } from '../domain/types';
import { preferredStore, setPreferred } from '../domain/stores';

export interface StoreChipProps {
  ingredientId: string;
  /** Used in the button labels so a screen reader knows which item. */
  ingredientName: string;
  prefs: ShopPrefs;
  /** Called with the whole new prefs; the caller saves the changed fields (shopPrefsPatch + setBase). */
  onChange: (prefs: ShopPrefs) => void;
}

export function StoreChip({ ingredientId, ingredientName, prefs, onChange }: StoreChipProps) {
  const [open, setOpen] = useState(false);
  const current = preferredStore(prefs, ingredientId);
  function choose(storeId: string | null) {
    onChange(setPreferred(prefs, ingredientId, storeId));
    setOpen(false);
  }
  return (
    <>
      <button type="button" className="store-chip" aria-label={`Store for ${ingredientName}: ${current ? current.name : 'Any store'}. Change`} onClick={() => setOpen(true)}>
        {current ? current.name : 'Any store'}
      </button>
      {open && (
        <div className="psheet">
          <button type="button" className="psheet__backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="psheet__panel" role="dialog" aria-modal="true" aria-label={`Where to buy ${ingredientName}`}>
            <div className="psheet__head">
              <div>
                <h2 className="psheet__name">Where to buy</h2>
                <p className="psheet__now">{ingredientName}</p>
              </div>
              <button type="button" className="psheet__close" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="store-sheet__list">
              <button type="button" className="choice-chip store-sheet__option" aria-pressed={current === null} onClick={() => choose(null)}>Any store</button>
              {prefs.stores.map(s => (
                <button key={s.id} type="button" className="choice-chip store-sheet__option" aria-pressed={current?.id === s.id} onClick={() => choose(s.id)}>{s.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
