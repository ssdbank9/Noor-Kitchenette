// Loading and removing the optional sample pantry (D-18). Loading stamps fresh events with
// the current time and new ids (so it can be loaded again after being removed); every such
// event has an id starting with SAMPLE_PREFIX, which is how removal finds them.
import { effectiveIds, makeEvent, reverse } from './ledger';
import type { KitchenEvent } from './types';

export const SAMPLE_PREFIX = 'sample-';

export function sampleEvents(demo: KitchenEvent[], now: Date, timeZone: string, nonce: string = now.getTime().toString(36)): KitchenEvent[] {
  return demo.map(e => makeEvent('set-stock', e.movements, now, {
    id: `${SAMPLE_PREFIX}${e.movements[0].ingredientId}-${nonce}`,
    source: e.source,
    note: e.note,
  }, timeZone));
}

/**
 * Reversals for every sample event still in effect (none when there is nothing to remove),
 * or only for the ids in `only` (undoing one load).
 */
export function removeSampleEvents(events: KitchenEvent[], now: Date, only?: ReadonlySet<string>): KitchenEvent[] {
  const live = effectiveIds(events);
  return events
    .filter(e => e.kind === 'set-stock' && e.id.startsWith(SAMPLE_PREFIX) && live.has(e.id) && (!only || only.has(e.id)))
    .map(e => reverse(e, events, now, 'Sample pantry removed'));
}
