// Small, plain helpers for saving a list change instead of a whole-list snapshot.
// A whole-snapshot write loses a concurrent edit from another open tab: each tab serialises
// its own stale copy and the later write wins (AR14 and the shopping/settings cases found in
// the 2026-10-06 review). A change carries only the rows that were added/changed and the keys
// that were removed, so the writer can apply it to whatever is stored right now.

export interface ArrayChange<T> {
  /** Rows to add or replace, by key. */
  upserts: T[];
  /** Keys to remove. */
  remove: string[];
}

/** The change from `before` to `after`, keyed by `key`. */
export function diffByKey<T>(
  before: readonly T[],
  after: readonly T[],
  key: (item: T) => string,
): ArrayChange<T> {
  const beforeByKey = new Map(before.map(item => [key(item), item]));
  const afterKeys = new Set(after.map(key));
  const upserts = after.filter(item => {
    const previous = beforeByKey.get(key(item));
    return previous === undefined || !same(previous, item);
  });
  const remove = [...beforeByKey.keys()].filter(k => !afterKeys.has(k));
  return { upserts, remove };
}

/** `current` with the change applied: removals first, then upserts (add or replace by key). */
export function applyArrayChange<T>(
  current: readonly T[],
  change: ArrayChange<T>,
  key: (item: T) => string,
): T[] {
  const removed = new Set(change.remove);
  const next = current.filter(item => !removed.has(key(item)));
  const at = new Map(next.map((item, i) => [key(item), i]));
  for (const item of change.upserts) {
    const i = at.get(key(item));
    if (i === undefined) {
      at.set(key(item), next.length);
      next.push(item);
    } else {
      next[i] = item;
    }
  }
  return next;
}

function same<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
