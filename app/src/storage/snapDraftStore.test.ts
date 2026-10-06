import { beforeEach, describe, expect, it } from 'vitest';
import { newDraft } from '../domain/photoDraft';
import { clearSnapDraft, hasSnapDraft, loadSnapDraft, saveSnapDraft } from './snapDraftStore';

// The recovery copy that keeps an in-progress Snap reading across a page reload. Photos are
// never stored; only the validated draft text is.

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}

beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage(); });

describe('snap draft store', () => {
  it('round-trips a draft and clears it', () => {
    const draft = newDraft('groceries');
    draft.lines.push({ key: 'Onion' } as never);

    expect(hasSnapDraft()).toBe(false);
    saveSnapDraft(draft);
    expect(hasSnapDraft()).toBe(true);
    expect(loadSnapDraft()?.eventId).toBe(draft.eventId);
    expect(loadSnapDraft()?.lines).toHaveLength(1);

    clearSnapDraft();
    expect(hasSnapDraft()).toBe(false);
    expect(loadSnapDraft()).toBeNull();
  });

  it('ignores unreadable or malformed data instead of throwing', () => {
    localStorage.setItem('noors-kitchen:snap-draft', '{not json');
    expect(loadSnapDraft()).toBeNull();
    localStorage.setItem('noors-kitchen:snap-draft', JSON.stringify({ nope: true }));
    expect(loadSnapDraft()).toBeNull();
  });

  it('never throws when storage is blocked or full', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => saveSnapDraft(newDraft('groceries'))).not.toThrow();
    expect(loadSnapDraft()).toBeNull();
    expect(() => clearSnapDraft()).not.toThrow();
  });
});
