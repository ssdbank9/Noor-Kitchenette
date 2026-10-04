// IndexedDB storage for the kitchen (F44; fixes v3 defect D6 together with saveQueue.ts).
// v3 saved with try { localStorage.setItem(...) } catch(e) {}, so a failed save looked fine
// on screen and the change was gone after a reload. Every write here waits for its
// transaction to commit (tx.done) and throws if it does not, so the caller can show the
// failure and keep the change for retry instead of losing it.

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import {
  SCHEMA_VERSION,
  type Ingredient,
  type KitchenData,
  type KitchenEvent,
  type Recipe,
} from '../domain/types';

export const DB_NAME = 'noors-kitchen';
/** Version of the IndexedDB layout (object stores). Not the same as the data SCHEMA_VERSION. */
const DB_LAYOUT_VERSION = 1;

export type KitchenSettings = KitchenData['settings'];

/** The kitchen as it was saved just before a restore replaced it (F46, F74). */
export interface PreRestoreBackup {
  /** UTC instant the copy was taken, ISO 8601. */
  takenAt: string;
  data: KitchenData;
}

interface MetaValues {
  settings: KitchenSettings;
  schemaVersion: number;
  'pre-restore-backup': PreRestoreBackup;
}
type MetaKey = keyof MetaValues;

interface KitchenDbSchema extends DBSchema {
  ingredients: { key: string; value: Ingredient };
  recipes: { key: string; value: Recipe };
  events: { key: string; value: KitchenEvent };
  meta: { key: MetaKey; value: MetaValues[MetaKey] };
}

type StoreName = StoreNames<KitchenDbSchema>;
export type KitchenDb = IDBPDatabase<KitchenDbSchema>;
type KitchenTx<Mode extends IDBTransactionMode> = IDBPTransaction<KitchenDbSchema, StoreName[], Mode>;

const ALL_STORES: StoreName[] = ['ingredients', 'recipes', 'events', 'meta'];

export function openKitchenDb(name: string = DB_NAME): Promise<KitchenDb> {
  return openDB<KitchenDbSchema>(name, DB_LAYOUT_VERSION, {
    upgrade(db) {
      for (const store of ['ingredients', 'recipes', 'events'] as const) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    },
  });
}

/**
 * The saved kitchen, or null when nothing has been saved yet (first run: seed it).
 * Ingredients and recipes come back in id order, events in time order (`at`, then id).
 * Throws when the saved data is incomplete or from a schema version this app cannot read.
 */
export async function loadKitchen(db: KitchenDb): Promise<KitchenData | null> {
  const tx = db.transaction(ALL_STORES, 'readonly');
  const [kitchen] = await Promise.all([readKitchen(tx), tx.done]);
  return kitchen;
}

/** The copy kept by the last restore, if any. */
export async function loadPreRestoreBackup(db: KitchenDb): Promise<PreRestoreBackup | null> {
  const copy = await db.get('meta', 'pre-restore-backup');
  return (copy as PreRestoreBackup | undefined) ?? null;
}

/**
 * Saves events by id. `put`, not `add`: replaying an operation that was already written
 * (after a reload, see saveQueue.ts) must succeed and change nothing.
 */
export function saveEvents(db: KitchenDb, events: KitchenEvent[]): Promise<void> {
  return writeToSetUpKitchen(db, 'events', (tx, queued) => {
    for (const event of events) queued.push(tx.objectStore('events').put(event));
  });
}

export function saveRecipe(db: KitchenDb, recipe: Recipe): Promise<void> {
  return writeToSetUpKitchen(db, 'recipes', (tx, queued) => {
    queued.push(tx.objectStore('recipes').put(recipe));
  });
}

export function saveIngredient(db: KitchenDb, ingredient: Ingredient): Promise<void> {
  return writeToSetUpKitchen(db, 'ingredients', (tx, queued) => {
    queued.push(tx.objectStore('ingredients').put(ingredient));
  });
}

export function saveSettings(db: KitchenDb, settings: KitchenSettings): Promise<void> {
  return writeToSetUpKitchen(db, 'meta', (tx, queued) => {
    queued.push(tx.objectStore('meta').put(settings, 'settings'));
  });
}

/** Replaces everything in one transaction: either all of `data` is saved or nothing changes. */
export async function replaceAll(db: KitchenDb, data: KitchenData): Promise<void> {
  checkReplacement(data);
  const tx = writeTransaction(db, ALL_STORES);
  await commit(tx, queued => queueReplacement(tx, data, queued));
}

/**
 * Like replaceAll, but first stores the current kitchen in 'meta' as 'pre-restore-backup',
 * in the same transaction, so the copy and the replacement are saved together or not at all.
 * Returns the copy, or null when there was nothing saved to keep.
 */
export async function replaceAllKeepingCopy(
  db: KitchenDb,
  data: KitchenData,
  takenAt: Date = new Date(),
): Promise<PreRestoreBackup | null> {
  checkReplacement(data);
  const tx = writeTransaction(db, ALL_STORES);
  let current: KitchenData | null;
  try {
    current = await readKitchen(tx);
  } catch (error) {
    await abandon(tx);
    throw error;
  }
  const copy = current && { takenAt: takenAt.toISOString(), data: current };
  await commit(tx, queued => {
    if (copy) queued.push(tx.objectStore('meta').put(copy, 'pre-restore-backup'));
    queueReplacement(tx, data, queued);
  });
  return copy;
}

/** One write to the database, as the save queue stores and replays it. Plain JSON. */
export type KitchenWrite =
  | { type: 'events'; events: KitchenEvent[] }
  | { type: 'recipe'; recipe: Recipe }
  | { type: 'ingredient'; ingredient: Ingredient }
  | { type: 'settings'; settings: KitchenSettings };

/** The writer to hand to createSaveQueue for this database. */
export function kitchenWriter(db: KitchenDb): (write: KitchenWrite) => Promise<void> {
  return write => {
    switch (write.type) {
      case 'events': return saveEvents(db, write.events);
      case 'recipe': return saveRecipe(db, write.recipe);
      case 'ingredient': return saveIngredient(db, write.ingredient);
      case 'settings': return saveSettings(db, write.settings);
    }
  };
}

async function readKitchen<Mode extends IDBTransactionMode>(tx: KitchenTx<Mode>): Promise<KitchenData | null> {
  const meta = tx.objectStore('meta');
  const [ingredients, recipes, events, schemaVersion, settings] = await Promise.all([
    tx.objectStore('ingredients').getAll(),
    tx.objectStore('recipes').getAll(),
    tx.objectStore('events').getAll(),
    meta.get('schemaVersion') as Promise<number | undefined>,
    meta.get('settings') as Promise<KitchenSettings | undefined>,
  ]);
  const empty = ingredients.length === 0 && recipes.length === 0 && events.length === 0;
  if (schemaVersion === undefined && settings === undefined && empty) return null;
  if (schemaVersion === undefined || settings === undefined) {
    throw new Error(
      `The saved kitchen is incomplete (no ${schemaVersion === undefined ? 'schema version' : 'settings'}).`,
    );
  }
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`The saved kitchen uses schema version ${schemaVersion}; this app reads version ${SCHEMA_VERSION}.`);
  }
  events.sort(byTime);
  return { schemaVersion, ingredients, recipes, events, settings };
}

function byTime(a: KitchenEvent, b: KitchenEvent): number {
  const time = Date.parse(a.at) - Date.parse(b.at);
  if (time) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A single-record write. Refused until replaceAll has set the kitchen up, so the database
 * never holds records without settings and a schema version (which loadKitchen rejects).
 */
async function writeToSetUpKitchen(
  db: KitchenDb,
  store: StoreName,
  queue: (tx: KitchenTx<'readwrite'>, queued: Promise<unknown>[]) => void,
): Promise<void> {
  const tx = writeTransaction(db, store === 'meta' ? ['meta'] : [store, 'meta']);
  const version = await tx.objectStore('meta').get('schemaVersion');
  if (version !== SCHEMA_VERSION) {
    // Nothing has been queued, so the transaction commits empty.
    await tx.done;
    throw new Error(
      version === undefined
        ? 'The kitchen has not been set up yet, so nothing was saved.'
        : `The saved kitchen uses schema version ${String(version)}; this app writes version ${SCHEMA_VERSION}.`,
    );
  }
  await commit(tx, queued => queue(tx, queued));
}

/**
 * Queues the requests, then waits for every request and for the commit. A request that
 * throws while being queued (for example a record without an id) aborts the transaction,
 * so the requests already queued are not committed on their own.
 */
async function commit(tx: KitchenTx<'readwrite'>, queue: (queued: Promise<unknown>[]) => void): Promise<void> {
  const queued: Promise<unknown>[] = [];
  try {
    queue(queued);
  } catch (error) {
    await abandon(tx, queued);
    throw error;
  }
  await Promise.all([...queued, tx.done]);
}

function writeTransaction(db: KitchenDb, stores: StoreName[]): KitchenTx<'readwrite'> {
  const tx = db.transaction(stores, 'readwrite');
  // Every caller either awaits tx.done or throws the error that aborted the transaction.
  // This only stops that same abort from also surfacing as an unhandled rejection.
  tx.done.catch(() => undefined);
  return tx;
}

/** Aborts a transaction we are giving up on, and waits until it and its requests settle. */
async function abandon(tx: KitchenTx<'readwrite'>, queued: Promise<unknown>[] = []): Promise<void> {
  try {
    tx.abort();
  } catch {
    // Already aborted by a failed request: the caller rethrows that failure.
  }
  await Promise.allSettled([...queued, tx.done]);
}

function checkReplacement(data: KitchenData): void {
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Cannot save schema version ${data.schemaVersion}; this app writes version ${SCHEMA_VERSION}.`);
  }
  // put() with a repeated id would keep only the last record: refuse instead of losing one.
  for (const [list, items] of [
    ['ingredient', data.ingredients],
    ['recipe', data.recipes],
    ['event', data.events],
  ] as const) {
    const seen = new Set<string>();
    for (const { id } of items) {
      if (seen.has(id)) throw new Error(`Two ${list}s have the id "${id}"; nothing was saved.`);
      seen.add(id);
    }
  }
}

function queueReplacement(tx: KitchenTx<'readwrite'>, data: KitchenData, queued: Promise<unknown>[]): void {
  const ingredients = tx.objectStore('ingredients');
  const recipes = tx.objectStore('recipes');
  const events = tx.objectStore('events');
  const meta = tx.objectStore('meta');
  queued.push(ingredients.clear(), recipes.clear(), events.clear());
  for (const ingredient of data.ingredients) queued.push(ingredients.put(ingredient));
  for (const recipe of data.recipes) queued.push(recipes.put(recipe));
  for (const event of data.events) queued.push(events.put(event));
  queued.push(meta.put(data.settings, 'settings'), meta.put(data.schemaVersion, 'schemaVersion'));
}
