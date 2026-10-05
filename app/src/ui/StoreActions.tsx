// Whole-list store actions (D-22): share by store, copy the list and open a copy-list store,
// directions. Nothing is ever added to a store's cart; no prices or stock are shown.
import { useState } from 'react';
import type { Ingredient, ShopPrefs } from '../domain/types';
import { copyListText, listText, mapsUrl, type StoreLine } from '../domain/stores';
import { copyText, openLink } from './storeHandoff';

export interface StoreActionsProps {
  lines: readonly StoreLine[];
  ingredients: readonly Ingredient[];
  prefs: ShopPrefs;
}

export function StoreActions({ lines, ingredients, prefs }: StoreActionsProps) {
  const [note, setNote] = useState('');

  async function share() {
    const text = listText(lines, ingredients, { groupBy: 'store', prefs });
    if (!text) { setNote('The list is empty.'); return; }
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'To buy', text }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; /* otherwise fall back to copying */ }
    }
    setNote((await copyText(text)) ? 'Sharing is not available here, so the list was copied. Paste it where you want it.' : 'Could not share or copy the list on this phone.');
  }

  // The link opens first, inside the tap, so the phone does not block it; then the list is copied.
  async function copyAndOpen(storeName: string, openUrl: string | undefined, text: string) {
    openLink(openUrl);
    if (!text) { setNote(`Nothing on the list for ${storeName}.`); return; }
    setNote((await copyText(text)) ? `List copied. Paste it in ${storeName}.` : `Could not copy. Copy the list by hand:\n${text}`);
  }

  const copyStores = prefs.stores.filter(s => s.kind === 'copy-list');
  const mapStores = prefs.stores.filter(s => s.mapsQuery);
  return (
    <div className="store-actions">
      <button type="button" className="button-primary store-actions__btn" disabled={lines.length === 0} onClick={() => void share()}>Share list by store</button>
      {copyStores.map(s => (
        <button key={s.id} type="button" className="button-tint store-actions__btn" disabled={lines.length === 0}
          onClick={() => void copyAndOpen(s.name, s.openUrl, copyListText(lines, ingredients, s, prefs))}>
          Copy list and open {s.name}
        </button>
      ))}
      {mapStores.map(s => (
        <a key={s.id} className="button-outline store-actions__btn" href={mapsUrl(s.mapsQuery!)} target="_blank" rel="noopener noreferrer">Directions to {s.name}</a>
      ))}
      {note && <p className="store-actions__note" role="status">{note}</p>}
    </div>
  );
}
