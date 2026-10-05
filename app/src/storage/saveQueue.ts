// Save status the screens can show (F44; fixes v3 defect D6).
// v3 wrapped every save in try { ... } catch(e) {}, so a failed save looked fine on screen
// and the change was gone after a reload. Here every change waits in an ordered queue until
// the writer confirms it. A failed change stays waiting (with everything after it), the
// status is 'error' until a retry succeeds, and nothing is dropped. Waiting changes are
// also copied to localStorage, so a reload after a failure can offer them again.

/** Where waiting changes are copied. */
export const PENDING_KEY = 'noors-kitchen:pending';
/** Format of the copy in localStorage: { version: 1, ops: [...] }. */
const PENDING_FORMAT = 1;

export type SaveStatus = 'idle' | 'saving' | 'error';

export interface SaveState {
  status: SaveStatus;
  /** Changes not yet confirmed saved, including the one being written now. */
  pending: number;
  /**
   * Why the last write failed (or that changes from last time are waiting). Stays set while
   * a retry is saving, and clears when a write succeeds.
   */
  lastError?: string;
  /**
   * Why the waiting changes could not be copied to localStorage. While this is set and
   * `pending` is above 0, those changes will be lost if the app is closed.
   */
  mirrorError?: string;
}

export interface SaveQueue<Op> {
  /** Adds a change. While status is 'error' it waits behind the failed one until retry(). Never rejects. */
  enqueue(op: Op): Promise<SaveState>;
  /** Writes the waiting changes again, in order. Never rejects: the outcome is in the state. */
  retry(): Promise<SaveState>;
  /** The changes still waiting, oldest first (includes ones kept from an earlier session). */
  getPending(): readonly Op[];
  /** The current state. The same object until something changes (fits React's useSyncExternalStore). */
  getState(): SaveState;
  /** Calls `listener` after every change of state. Returns the unsubscribe function. */
  subscribe(listener: (state: SaveState) => void): () => void;
}

/** The part of the Web Storage API the queue uses. */
export type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SaveQueueOptions {
  /** Where to copy waiting changes. Default: localStorage when the page has one; null: do not copy. */
  storage?: PendingStorage | null;
}

/**
 * `writer` must resolve only once `op` is durably saved, and reject (or throw) otherwise.
 * Operations must be plain JSON so they can be copied to localStorage. Changes copied there
 * by an earlier session are loaded as waiting, with status 'error', until retry().
 */
export function createSaveQueue<Op>(
  writer: (op: Op) => Promise<void>,
  options: SaveQueueOptions = {},
): SaveQueue<Op> {
  const listeners = new Set<(state: SaveState) => void>();
  const found = options.storage === undefined ? findLocalStorage() : { storage: options.storage };
  const storage = found.storage;
  let mirrorError = found.error;
  let pending: Op[] = [];
  let running: Promise<SaveState> | null = null;

  const restored = readMirror();
  pending = restored.ops;
  mirrorError = restored.error ?? mirrorError;
  let state = snapshot(
    pending.length > 0 ? 'error' : 'idle',
    pending.length > 0
      ? `${pending.length === 1 ? '1 change' : `${pending.length} changes`} from last time ${pending.length === 1 ? 'was' : 'were'} not saved yet.`
      : undefined,
  );

  function snapshot(status: SaveStatus, lastError: string | undefined): SaveState {
    const next: SaveState = { status, pending: pending.length };
    if (lastError !== undefined) next.lastError = lastError;
    if (mirrorError !== undefined) next.mirrorError = mirrorError;
    return next;
  }

  function publish(status: SaveStatus, lastError?: string): SaveState {
    state = snapshot(status, lastError);
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        // A broken screen must not stop saving; rethrow outside the queue so it is still seen.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
    return state;
  }

  function readMirror(): { ops: Op[]; error?: string } {
    if (!storage) return { ops: [] };
    let text: string | null;
    try {
      text = storage.getItem(PENDING_KEY);
    } catch (error) {
      return { ops: [], error: `Could not read changes kept from last time: ${describeError(error)}` };
    }
    if (text === null) return { ops: [] };
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        typeof parsed === 'object' && parsed !== null &&
        (parsed as { version?: unknown }).version === PENDING_FORMAT &&
        Array.isArray((parsed as { ops?: unknown }).ops)
      ) {
        return { ops: (parsed as { ops: Op[] }).ops };
      }
      return { ops: [], error: 'Changes kept from last time are in a format this app does not know.' };
    } catch (error) {
      return { ops: [], error: `Changes kept from last time could not be read: ${describeError(error)}` };
    }
  }

  /** Copies `pending` to storage. Never leaves an out-of-date copy that a reload would replay. */
  function writeMirror(): void {
    if (!storage) return;
    try {
      if (pending.length === 0) storage.removeItem(PENDING_KEY);
      else storage.setItem(PENDING_KEY, JSON.stringify({ version: PENDING_FORMAT, ops: pending }));
      mirrorError = undefined;
    } catch (error) {
      mirrorError = `Unsaved changes could not be kept for after a reload: ${describeError(error)}`;
      try {
        storage.removeItem(PENDING_KEY);
      } catch {
        // mirrorError above already reports that storage is failing.
      }
    }
  }

  function drain(): Promise<SaveState> {
    // Assigned before run() starts, so an enqueue from a listener joins this run.
    running ??= Promise.resolve().then(run);
    return running;
  }

  async function run(): Promise<SaveState> {
    for (;;) {
      if (pending.length === 0) {
        running = null; // before publishing, so a listener's enqueue starts a new run
        return publish('idle');
      }
      try {
        await writer(pending[0]);
      } catch (error) {
        running = null;
        return publish('error', describeError(error));
      }
      pending = pending.slice(1);
      writeMirror();
      if (pending.length > 0) publish('saving');
    }
  }

  return {
    enqueue(op) {
      pending = [...pending, op];
      writeMirror();
      if (state.status === 'error' && !running) {
        return Promise.resolve(publish('error', state.lastError));
      }
      publish('saving', state.lastError);
      return drain();
    },
    retry() {
      if (!running && pending.length > 0) publish('saving', state.lastError);
      return drain();
    },
    getState() {
      return state;
    },
    getPending() {
      return pending;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A short message for any thrown value (DOMException, Error, string, ...). */
export function describeError(error: unknown): string {
  if (error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException)) {
    return error.message || error.name;
  }
  return String(error);
}

function findLocalStorage(): { storage: PendingStorage | null; error?: string } {
  try {
    return { storage: typeof localStorage === 'undefined' ? null : localStorage };
  } catch (error) {
    // Some browsers throw on access when site data is blocked.
    return { storage: null, error: `Unsaved changes cannot be kept for after a reload: ${describeError(error)}` };
  }
}
