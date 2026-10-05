// Loads the kitchen from IndexedDB for the app and gives it a save queue (F44, D6).
// First run (empty database) writes the seed once; later runs load what was saved. Changes
// kept in localStorage from a session that ended before they were saved are merged into the
// loaded events and written again, so a reload after a failed save does not hide them.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { seed } from '../data/seed';
import { withRecipe, withoutRecipe } from '../domain/recipeForm';
import { refreshStarter } from './refreshStarter';
import type { KitchenData, KitchenEvent } from '../domain/types';
import type { ShoppingList } from '../domain/shopping';
import { kitchenWriter, loadKitchen, loadShopping, openKitchenDb, type KitchenDb, replaceAll, type KitchenWrite } from './db';
import { createSaveQueue, describeError, type SaveQueue, type SaveState } from './saveQueue';

export interface KitchenStore {
  data: KitchenData;
  /** The saved shopping list (F36), with any unsaved change from last time applied. */
  shopping: ShoppingList;
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
  // F40: recipe and ingredient changes that were not saved yet (the page closed first) are
  // applied to what is shown, before the starter refresh, so they are neither hidden nor overwritten.
  for (const op of queue.getPending()) {
    if (op.type === 'recipe') data = withRecipe(data, op.recipe, []);
    else if (op.type === 'deleteRecipe') data = withoutRecipe(data, op.recipeId);
    else if (op.type === 'ingredient') data = { ...data, ingredients: [...data.ingredients.filter(i => i.id !== op.ingredient.id), op.ingredient] };
    else if (op.type === 'plan') data = { ...data, plan: [...(data.plan ?? []).filter(m => m.id !== op.meal.id), op.meal] };
    else if (op.type === 'deletePlan') data = { ...data, plan: (data.plan ?? []).filter(m => m.id !== op.id) };
    else if (op.type === 'leftover') data = { ...data, leftovers: [...(data.leftovers ?? []).filter(l => l.id !== op.item.id), op.item] };
    else if (op.type === 'deleteLeftover') data = { ...data, leftovers: (data.leftovers ?? []).filter(l => l.id !== op.id) };
    else if (op.type === 'batch') data = { ...data, batches: [...(data.batches ?? []).filter(b => b.id !== op.item.id), op.item] };
    else if (op.type === 'deleteBatch') data = { ...data, batches: (data.batches ?? []).filter(b => b.id !== op.id) };
    else if (op.type === 'favourite') data = { ...data, favourites: [...(data.favourites ?? []).filter(f => f.id !== op.item.id), op.item] };
    else if (op.type === 'deleteFavourite') data = { ...data, favourites: (data.favourites ?? []).filter(f => f.id !== op.id) };
  }
  // Starter recipes improved by an app update reach Noor's saved copy (never her edits).
  const refreshed = refreshStarter(data, seed);
  data = refreshed.data;
  for (const recipe of refreshed.recipes) void queue.enqueue({ type: 'recipe', recipe });
  for (const ingredient of refreshed.ingredients) void queue.enqueue({ type: 'ingredient', ingredient });
  let shopping = await loadShopping(db);
  const pending = queue.getPending();
  // Unsaved changes from last time: a 'purchase' carries its event AND the list after it,
  // so replaying it later (idempotent: event put by id, list is a snapshot) cannot double-apply.
  for (const op of pending) if (op.type === 'shopping' || op.type === 'purchase') shopping = op.list;
  const waiting = pending.flatMap(op => (op.type === 'events' ? op.events : op.type === 'purchase' ? [op.event] : []));
  if (waiting.length > 0) {
    const known = new Set(data.events.map(e => e.id));
    const events: KitchenEvent[] = [...data.events, ...waiting.filter(e => !known.has(e.id))];
    events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    data = { ...data, events };
  }
  if (queue.getPending().length > 0) void queue.retry();
  return { data, shopping, queue, db };
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
