// Safe app updates: reloading to a new version must never throw away a change that is
// still waiting to be saved (or one that failed to save).
import type { SaveState } from '../storage/saveQueue';

/** True only when nothing is waiting or failed, so a reload loses nothing. */
export function canUpdateNow(save: Pick<SaveState, 'status' | 'pending'>): boolean {
  return save.pending === 0 && save.status === 'idle';
}
