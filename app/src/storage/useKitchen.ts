// Loads the kitchen from IndexedDB for the app and gives it a save queue (F44, D6).
// First run (empty database) writes the seed once; later runs load what was saved. Changes
// kept in localStorage from a session that ended before they were saved are merged into the
// loaded events and written again, so a reload after a failed save does not hide them.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { seed } from '../data/seed';
import type { KitchenData, KitchenEvent } from '../domain/types';
import { kitchenWriter, loadKitchen, openKitchenDb, type KitchenDb, replaceAll, type KitchenWrite } from './db';
import { createSaveQueue, describeError, type SaveQueue, type SaveState } from './saveQueue';

export interface KitchenStore {
  data: KitchenData;
  queue: SaveQueue<KitchenWrite>;
  /** For restoring a backup (settings screen). */
  db: KitchenDb;
}

export type KitchenLoad =
  | { phase: 'loading' }
  | { phase: 'failed'; error: string }
  | { phase: 'ready'; store: KitchenStore };

async function boot(): Promise<KitchenStore> {
  const db = await openKitchenDb();
  let data = await loadKitchen(db);
  if (!data) {
    await replaceAll(db, seed);
    data = seed;
  }
  const queue = createSaveQueue<KitchenWrite>(kitchenWriter(db));
  const waiting = queue.getPending().flatMap(op => (op.type === 'events' ? op.events : []));
  if (waiting.length > 0) {
    const known = new Set(data.events.map(e => e.id));
    const events: KitchenEvent[] = [...data.events, ...waiting.filter(e => !known.has(e.id))];
    events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    data = { ...data, events };
  }
  if (queue.getPending().length > 0) void queue.retry();
  return { data, queue, db };
}

// One boot per page load, so React StrictMode's second effect run does not open twice.
let booting: Promise<KitchenStore> | null = null;

export function useKitchenLoad(): KitchenLoad & { reload: () => void } {
  const [load, setLoad] = useState<KitchenLoad>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    booting ??= boot();
    booting.then(
      store => current && setLoad({ phase: 'ready', store }),
      error => {
        booting = null; // allow a retry
        if (current) setLoad({ phase: 'failed', error: describeError(error) });
      },
    );
    return () => { current = false; };
  }, [attempt]);
  return { ...load, reload: () => { setLoad({ phase: 'loading' }); setAttempt(n => n + 1); } };
}

export function useSaveState(queue: SaveQueue<KitchenWrite>): SaveState {
  return useSyncExternalStore(queue.subscribe, queue.getState);
}
