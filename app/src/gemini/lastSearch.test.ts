import { describe, expect, it } from 'vitest';
import { lastSearchWhen, readLastSearch, writeLastSearch, type LastSearch } from './lastSearch';

// In-memory localStorage stand-in.
function store() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    _map: map,
  };
}

describe('last search record', () => {
  it('writes and reads a successful search back', () => {
    const s = store();
    writeLastSearch({ via: 'Command Code · openai/gpt-6-luna', ok: true, pages: 8 }, s);
    const read = readLastSearch(s);
    expect(read).toMatchObject({ via: 'Command Code · openai/gpt-6-luna', ok: true, pages: 8 });
    expect(typeof (read as LastSearch | null)?.at).toBe('string');
  });
  it('keeps a failure message and drops nothing else in', () => {
    const s = store();
    writeLastSearch({ via: 'Command Code · x', ok: false, message: 'Command Code did not accept the key. Check it in Settings.' }, s);
    expect(readLastSearch(s)).toMatchObject({ ok: false, message: 'Command Code did not accept the key. Check it in Settings.' });
    expect(JSON.stringify([...s._map.values()])).not.toContain('key-');
  });
  it('returns null for nothing, garbage or wrong shapes, and never throws', () => {
    const s = store();
    expect(readLastSearch(s)).toBeNull();
    s.setItem('noors-kitchen:last-search', 'not json{');
    expect(readLastSearch(s)).toBeNull();
    s.setItem('noors-kitchen:last-search', JSON.stringify({ at: 'x', ok: 'yes' }));
    expect(readLastSearch(s)).toBeNull();
    expect(() => readLastSearch({ getItem: () => { throw new Error('blocked'); } })).not.toThrow();
    expect(() => writeLastSearch({ ok: true }, { getItem: () => null, setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
  it('formats the time in the household zone', () => {
    const when = lastSearchWhen({ at: '2026-11-05T13:42:00Z', ok: true }, 'Asia/Karachi');
    expect(when).toMatch(/5 Nov/);
    expect(when).toMatch(/:42/);
  });
});
