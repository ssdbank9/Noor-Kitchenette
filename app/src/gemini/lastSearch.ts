// A one-line record of the last dish search, kept in localStorage: which engine answered,
// how many pages it found, or why it failed. Settings shows it, so "search doesn't work"
// comes with the diagnosis already on the screen. Never contains a key or a query.
const KEY = 'noors-kitchen:last-search';

export interface LastSearch {
  /** When the search finished, ISO. */
  at: string;
  /** Which engine and model answered, e.g. "Command Code · openai/gpt-6-luna". */
  via?: string;
  ok: boolean;
  /** Pages the search found, when it worked. */
  pages?: number;
  /** Why it failed, in the app's own words. */
  message?: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function writeLastSearch(entry: Omit<LastSearch, 'at'>, storage: StorageLike = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify({ ...entry, at: new Date().toISOString() }));
  } catch {
    // A full or blocked storage must never break a search.
  }
}

export function readLastSearch(storage: Pick<Storage, 'getItem'> = localStorage): LastSearch | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (typeof v.at !== 'string' || typeof v.ok !== 'boolean') return null;
    return {
      at: v.at,
      ...(typeof v.via === 'string' ? { via: v.via } : {}),
      ok: v.ok,
      ...(typeof v.pages === 'number' ? { pages: v.pages } : {}),
      ...(typeof v.message === 'string' ? { message: v.message } : {}),
    };
  } catch {
    return null;
  }
}

/** "5 Nov, 18:42" in the household's words. */
export function lastSearchWhen(entry: LastSearch, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(entry.at));
  } catch {
    return entry.at;
  }
}
