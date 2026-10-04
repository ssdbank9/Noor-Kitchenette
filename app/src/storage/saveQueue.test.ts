import { describe, expect, it, vi } from 'vitest';
import { createSaveQueue, PENDING_KEY, type PendingStorage, type SaveState } from './saveQueue';

/** In-memory localStorage. `failWrites` makes setItem throw like a full browser storage. */
class MemoryStorage implements PendingStorage {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  pendingOps(): unknown[] | null {
    const text = this.getItem(PENDING_KEY);
    return text === null ? null : (JSON.parse(text) as { ops: unknown[] }).ops;
  }
}

/** A writer that fails while `failing` is true, and records what it saved. */
function flakyWriter() {
  const writer = {
    failing: true,
    saved: [] as string[],
    attempts: [] as string[],
    write: async (op: string) => {
      writer.attempts.push(op);
      if (writer.failing) throw new DOMException('The database is not available.', 'UnknownError');
      writer.saved.push(op);
    },
  };
  return writer;
}

describe('save queue: a failed save is visible and kept (D6)', () => {
  it('shows the error, keeps the change, and saves it on retry', async () => {
    const storage = new MemoryStorage();
    const writer = flakyWriter();
    const queue = createSaveQueue(writer.write, { storage });

    const afterFailure = await queue.enqueue('add 12 eggs');
    // v3 swallowed the error here: the screen looked saved and the change was gone on reload.
    expect(afterFailure.status).toBe('error');
    expect(afterFailure.lastError).toBe('The database is not available.');
    expect(afterFailure.pending).toBe(1);
    expect(queue.getState()).toBe(afterFailure);
    expect(writer.saved).toEqual([]);
    expect(storage.pendingOps()).toEqual(['add 12 eggs']); // still there for after a reload

    writer.failing = false;
    const afterRetry = await queue.retry();
    expect(writer.saved).toEqual(['add 12 eggs']);
    expect(afterRetry).toEqual({ status: 'idle', pending: 0 });
    expect(storage.pendingOps()).toBeNull();
  });

  it('keeps the error showing until a retry succeeds', async () => {
    const writer = flakyWriter();
    const queue = createSaveQueue(writer.write, { storage: null });
    await queue.enqueue('a');
    expect((await queue.retry()).status).toBe('error');
    expect(queue.getState()).toMatchObject({ status: 'error', pending: 1 });
    writer.failing = false;
    expect(await queue.retry()).toEqual({ status: 'idle', pending: 0 });
  });

  it('keeps later changes waiting, in order, behind a failed one', async () => {
    const writer = flakyWriter();
    const queue = createSaveQueue(writer.write, { storage: null });
    await queue.enqueue('first');
    const state = await queue.enqueue('second');
    expect(state).toMatchObject({ status: 'error', pending: 2 });
    expect(writer.attempts).toEqual(['first']); // 'second' did not jump ahead

    writer.failing = false;
    await queue.retry();
    expect(writer.saved).toEqual(['first', 'second']);
    expect(queue.getState()).toEqual({ status: 'idle', pending: 0 });
  });

  it('offers changes from before a reload again', async () => {
    const storage = new MemoryStorage();
    const before = flakyWriter();
    await createSaveQueue(before.write, { storage }).enqueue('add rice');

    const after = flakyWriter();
    after.failing = false;
    const reloaded = createSaveQueue(after.write, { storage });
    expect(reloaded.getState()).toEqual({
      status: 'error',
      pending: 1,
      lastError: '1 change from last time was not saved yet.',
    });
    expect(after.attempts).toEqual([]); // offered, not written behind Noor's back

    expect(await reloaded.retry()).toEqual({ status: 'idle', pending: 0 });
    expect(after.saved).toEqual(['add rice']);
    expect(storage.pendingOps()).toBeNull();
  });

  it('a writer that throws synchronously is reported the same way', async () => {
    const queue = createSaveQueue<string>(() => {
      throw new Error('boom');
    }, { storage: null });
    expect(await queue.enqueue('x')).toEqual({ status: 'error', pending: 1, lastError: 'boom' });
  });
});

describe('save queue: localStorage failures are reported, not swallowed', () => {
  it('reports a full localStorage while the database write is also failing', async () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const writer = flakyWriter();
    const queue = createSaveQueue(writer.write, { storage });

    const state = await queue.enqueue('add salt');
    expect(state.status).toBe('error');
    expect(state.pending).toBe(1);
    expect(state.mirrorError).toContain('The quota has been exceeded.');
    expect(storage.pendingOps()).toBeNull();

    writer.failing = false;
    storage.failWrites = false;
    expect(await queue.retry()).toEqual({ status: 'idle', pending: 0 });
    expect(writer.saved).toEqual(['add salt']);
  });

  it('shows a full localStorage to subscribers while saving', async () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const queue = createSaveQueue(async () => {}, { storage });
    const seen: SaveState[] = [];
    queue.subscribe(state => seen.push(state));
    await queue.enqueue('x');
    expect(seen[0]).toMatchObject({ status: 'saving', pending: 1 });
    expect(seen[0].mirrorError).toContain('quota');
  });

  it('removes an out-of-date copy when the new one cannot be written', async () => {
    const storage = new MemoryStorage();
    const writer = flakyWriter();
    const queue = createSaveQueue(writer.write, { storage });
    await queue.enqueue('a');
    expect(storage.pendingOps()).toEqual(['a']);
    storage.failWrites = true;
    await queue.enqueue('b');
    // Never leave ['a'] behind as if it were the whole list.
    expect(storage.pendingOps()).toBeNull();
    expect(queue.getState().mirrorError).toContain('quota');
  });

  it('reports localStorage that throws on access', async () => {
    const storage: PendingStorage = {
      getItem: () => {
        throw new DOMException('Access denied.', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Access denied.', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('Access denied.', 'SecurityError');
      },
    };
    const queue = createSaveQueue(async () => {}, { storage });
    expect(queue.getState().mirrorError).toContain('Access denied.');
    await queue.enqueue('x');
    expect(queue.getState()).toMatchObject({ status: 'idle', pending: 0 });
    expect(queue.getState().mirrorError).toContain('Access denied.');
  });

  it('reports a copy from last time that cannot be read', () => {
    const storage = new MemoryStorage();
    storage.items.set(PENDING_KEY, '{not json');
    const queue = createSaveQueue(async () => {}, { storage });
    expect(queue.getState().mirrorError).toContain('could not be read');
  });
});

describe('save queue: subscribing', () => {
  it('notifies subscribers of each change and stops after unsubscribe', async () => {
    const queue = createSaveQueue(async () => {}, { storage: null });
    const seen: SaveState[] = [];
    const unsubscribe = queue.subscribe(state => seen.push(state));
    await queue.enqueue('a');
    expect(seen.map(s => s.status)).toEqual(['saving', 'idle']);
    unsubscribe();
    await queue.enqueue('b');
    expect(seen).toHaveLength(2);
  });

  it('keeps the same state object until something changes', async () => {
    const queue = createSaveQueue(async () => {}, { storage: null });
    const first = queue.getState();
    expect(queue.getState()).toBe(first);
    await queue.enqueue('a');
    expect(queue.getState()).not.toBe(first);
  });

  it('writes changes added during a save once each, in order', async () => {
    const saved: string[] = [];
    let release: () => void = () => {};
    const queue = createSaveQueue(async (op: string) => {
      if (op === 'slow') await new Promise<void>(resolve => (release = resolve));
      saved.push(op);
    }, { storage: null });

    const slow = queue.enqueue('slow');
    await Promise.resolve();
    void queue.enqueue('b');
    void queue.enqueue('c');
    expect(queue.getState()).toMatchObject({ status: 'saving', pending: 3 });
    release();
    expect(await slow).toEqual({ status: 'idle', pending: 0 });
    expect(saved).toEqual(['slow', 'b', 'c']);
  });

  it('a subscriber that throws does not stop saving, and its error is rethrown', async () => {
    const rethrown: (() => void)[] = [];
    vi.stubGlobal('queueMicrotask', (callback: () => void) => rethrown.push(callback));
    try {
      const queue = createSaveQueue(async () => {}, { storage: null });
      queue.subscribe(() => {
        throw new Error('screen bug');
      });
      expect(await queue.enqueue('a')).toEqual({ status: 'idle', pending: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(rethrown.length).toBeGreaterThan(0);
    expect(rethrown[0]).toThrow('screen bug');
  });
});
