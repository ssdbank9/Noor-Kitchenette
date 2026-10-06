// Keeps an in-progress Snap-pantry reading so it is not lost when the phone browser discards
// and reloads the page (a real-phone finding: after alt-tabbing away and back, the screen and
// what Gemini had read were gone). Only the validated Draft TEXT is kept — never the photo,
// which stays in memory by design (D-20). Best effort: if storage is full or blocked, saving
// the kitchen still works and only this recovery copy is skipped.
import type { Draft } from '../domain/photoDraft';

const KEY = 'noors-kitchen:snap-draft';

/** The saved draft, or null when there is none or it is unreadable. */
export function loadSnapDraft(): Draft | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Draft).eventId === 'string' &&
      Array.isArray((parsed as Draft).lines)
    ) {
      return parsed as Draft;
    }
    return null;
  } catch {
    return null;
  }
}

/** Remembers the draft, replacing any earlier one. Never throws. */
export function saveSnapDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // No recovery copy; the reading is still in memory and the kitchen still saves normally.
  }
}

/** Forgets the draft (after it is saved or discarded). Never throws. */
export function clearSnapDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; a stale copy is harmless and is overwritten next time.
  }
}

/** True when a saved reading is waiting to be recovered. */
export function hasSnapDraft(): boolean {
  return loadSnapDraft() !== null;
}
