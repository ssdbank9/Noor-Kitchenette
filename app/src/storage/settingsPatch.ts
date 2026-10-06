// A settings change that survives the localStorage mirror. A key is removed by naming it in
// `remove`, never by sending `undefined`: JSON.stringify drops undefined values, so a mirrored
// `{ homeArea: undefined }` became `{}` and the clear was lost on reload (GLM review N1).
// `slotTimes` may carry just the sub-keys that changed, so two open tabs changing different
// meal slots both stick instead of the later one replacing the whole object (GLM review N3).
import type { KitchenSettings } from './db';

/** A change to settings; a plain-object key (only `slotTimes`) may itself be partial. */
export type SettingsPatchInput = Omit<Partial<KitchenSettings>, 'slotTimes'> & {
  slotTimes?: Partial<KitchenSettings['slotTimes']>;
};

export interface SettingsPatch {
  /** Keys to set (or, for compatibility, to delete when a value is `undefined`). */
  patch: SettingsPatchInput;
  /** Keys to delete. JSON-safe, so the mirror and a reload keep the deletion. */
  remove?: string[];
}

/** `current` with the patch applied: removals first, then set/merge. */
export function applySettingsPatch(current: KitchenSettings, { patch, remove = [] }: SettingsPatch): KitchenSettings {
  const next: Record<string, unknown> = { ...current };
  for (const key of remove) delete next[key];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) { delete next[key]; continue; }
    const before = next[key];
    if (isPlainObject(before) && isPlainObject(value)) {
      // Never let a nested `undefined` survive: JSON.stringify would drop it from the mirror,
      // so in-memory and reloaded state would differ (GLM F1). Nested undefined means no change.
      const merged = { ...before };
      for (const [sub, subValue] of Object.entries(value)) if (subValue !== undefined) merged[sub] = subValue;
      next[key] = merged;
    } else {
      next[key] = value;
    }
  }
  return next as KitchenSettings;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
