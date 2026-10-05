import { useMemo, useState } from 'react';
import type { Balance } from '../domain/ledger';
import { batchStatuses, placesFor } from '../domain/batches'; // F66
import type { Batch, Ingredient, KitchenEvent } from '../domain/types';
import { LeftoversScreen } from './LeftoversScreen'; // F65
import { UseSoonScreen } from './UseSoonScreen'; // F67
import { WasteScreen } from './WasteScreen'; // F68
import type { KitchenDepth, PantryView } from './kitchenDepth'; // F65
import { CameraIcon } from './Icons'; // F52
import { PantrySheet } from './PantrySheet';

export interface PantryScreenProps {
  ingredients: Ingredient[];
  stock: Map<string, Balance>;
  format: (baseAmount: number, ingredient: Ingredient) => string;
  /** Called with the event a pantry action built, and the text for its toast. */
  onAction: (event: KitchenEvent, toast: string, batch?: Batch) => void;
  /** Opens Snap pantry (F52). */
  onSnap?: () => void;
  /** F65 to F68: the Leftovers, Use soon and Waste views, and places and dates. Without it the screen is just the item list. */
  depth?: KitchenDepth;
}

const VIEWS: { id: PantryView; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'leftovers', label: 'Leftovers' },
  { id: 'soon', label: 'Use soon' },
  { id: 'waste', label: 'Waste' },
];

function describe(i: Ingredient, b: Balance | undefined, format: PantryScreenProps['format']) {
  const low = b?.amount != null && i.minStock != null && b.amount < i.minStock;
  const text =
    !b ? 'none'
    : b.amount === null ? 'not sure'
    : b.needsCheck ? 'check stock'
    : format(b.amount, i) + (b.basis === 'estimate' ? ' · not confirmed' : '');
  return { low, text };
}

export function PantryScreen(p: PantryScreenProps) {
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = p.ingredients.filter(i => {
    if (q && !(i.name.toLowerCase().includes(q) || i.aliases.some(a => a.toLowerCase().includes(q)))) return false;
    if (lowOnly && !describe(i, p.stock.get(i.id), p.format).low) return false;
    return true;
  });
  const groups = new Map<string, Ingredient[]>();
  for (const i of visible) groups.set(i.aisle, [...(groups.get(i.aisle) ?? []), i]);
  const open = openId ? p.ingredients.find(i => i.id === openId) : undefined;
  const depth = p.depth;
  const view: PantryView = depth?.view ?? 'items';
  const statuses = useMemo(() => batchStatuses(depth?.batches ?? [], p.stock), [depth?.batches, p.stock]); // F66

  return (
    <div className="screen form-screen">
      <div className="pantry-head">
        <h1 className="title">Pantry</h1>
        {p.onSnap && (
          <button type="button" className="button-tint pantry-snap" onClick={p.onSnap}><CameraIcon size={20} /> Snap pantry</button>
        )}
      </div>
      {depth && ( // F65
        <div className="filter-chips" role="group" aria-label="Pantry views">
          {VIEWS.map(v => (
            <button key={v.id} type="button" className="choice-chip" aria-pressed={view === v.id} onClick={() => depth.onView(v.id)}>{v.label}</button>
          ))}
        </div>
      )}
      {depth && view === 'leftovers' && (
        <LeftoversScreen leftovers={depth.leftovers} today={depth.today} yesWord={depth.yesWord} noWord={depth.noWord} onChange={depth.onChangeLeftover} />
      )}
      {depth && view === 'soon' && (
        <UseSoonScreen leftovers={depth.leftovers} batches={depth.batches} ingredients={p.ingredients} stock={p.stock} today={depth.today} format={p.format} onOpenLeftovers={() => depth.onView('leftovers')} />
      )}
      {depth && view === 'waste' && (
        <WasteScreen events={depth.events} leftovers={depth.leftovers} ingredients={p.ingredients} today={depth.today} format={p.format} onUndo={depth.onUndoEvent} />
      )}
      {view === 'items' && <>
      <p className="eyebrow">Amounts marked "not confirmed" came from the old app and have not been checked.</p>
      <div className="pantry-tools">
        <input
          type="search"
          className="pantry-search"
          aria-label="Search pantry"
          placeholder="Search pantry"
          autoComplete="off"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="button" className="pantry-lowchip" aria-pressed={lowOnly} onClick={() => setLowOnly(v => !v)}>Low</button>
      </div>
      {visible.length === 0 && <p className="placeholder">Nothing matches.</p>}
      {[...groups.entries()].map(([aisle, items]) => (
        <section key={aisle} className="pantry-group" aria-label={aisle}>
          <h2>{aisle}</h2>
          {items.map(i => {
            const { low, text } = describe(i, p.stock.get(i.id), p.format);
            const b = p.stock.get(i.id);
            const places = depth ? placesFor(i.id, depth.batches, statuses) : []; // F66
            const cls = 'pantry-item__amount' + (low ? ' pantry-item__amount--low' : b?.basis !== 'measured' && b ? ' pantry-item__amount--unconfirmed' : '');
            return (
              <button key={i.id} type="button" className="pantry-item" onClick={() => setOpenId(i.id)}>
                <span>{i.name}</span>
                <span className={cls}>{low ? 'Low · ' : ''}{text}{places.length > 0 && <small className="pantry-item__place"> · {places.join(', ')}</small>}</span>
              </button>
            );
          })}
        </section>
      ))}
      </>}
      {view === 'items' && open && (
        <PantrySheet
          key={open.id}
          ingredient={open}
          balance={p.stock.get(open.id)}
          currentText={describe(open, p.stock.get(open.id), p.format).text}
          onClose={() => setOpenId(null)}
          onApply={(event, toast, batch) => { setOpenId(null); p.onAction(event, toast, batch); }}
          depth={depth && { ...depth, format: p.format }}
        />
      )}
    </div>
  );
}
