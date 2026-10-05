// "Find it" buttons for one item (D-22). No prices or stock are shown or claimed, and a link is
// never promised to return results; it only opens the store's own search page.
import { useState } from 'react';
import type { ShopPrefs } from '../domain/types';
import { mapsUrl, searchUrl } from '../domain/stores';
import { copyText } from './storeHandoff';

export interface FindOnStoreProps {
  /** The item's name, as shown to Noor. */
  itemName: string;
  prefs: ShopPrefs;
  /**
   * Text a copy-list store ("Copy list for pandamart") copies. Pass a function that returns
   * copyListText(...) of the whole list for that store. Left out, the item's name is copied.
   */
  copyTextFor?: (storeId: string) => string;
}

export function FindOnStore({ itemName, prefs, copyTextFor }: FindOnStoreProps) {
  const [note, setNote] = useState('');
  async function copy(storeId: string, storeName: string) {
    const text = copyTextFor ? copyTextFor(storeId) : itemName;
    if (!text) { setNote(`Nothing to copy for ${storeName}.`); return; }
    setNote((await copyText(text)) ? `Copied for ${storeName}. Paste it into the store's search.` : `Could not copy. Type this into ${storeName}: ${text}`);
  }
  return (
    <div className="find-store">
      {prefs.stores.map(s => {
        const url = s.kind === 'online-search' ? searchUrl(s, itemName) : null;
        const maps = s.mapsQuery ? mapsUrl(s.mapsQuery) : null;
        if (!url && !maps && s.kind !== 'copy-list') return null;
        return (
          <div key={s.id} className="find-store__row">
            {url && <a className="button-tint find-store__btn" href={url} target="_blank" rel="noopener noreferrer">Find on {s.name}</a>}
            {s.kind === 'copy-list' && <button type="button" className="button-tint find-store__btn" onClick={() => void copy(s.id, s.name)}>Copy list for {s.name}</button>}
            {maps && <a className="button-outline find-store__btn" href={maps} target="_blank" rel="noopener noreferrer">Map: {s.name}</a>}
            {url && s.unverified && <span className="find-store__note">Unconfirmed link: it may not show this item.</span>}
          </div>
        );
      })}
      {note && <p className="find-store__note" role="status">{note}</p>}
    </div>
  );
}
