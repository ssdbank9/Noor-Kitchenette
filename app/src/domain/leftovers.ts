// Prepared food kept for later (F65). The ONE place portions change, so the Plan tab and the
// Leftovers screen follow the same rules. Using a leftover never touches raw ingredient
// stock: those were already deducted when the dish was cooked.
import type { Leftover, StorageLocation } from './types';

export type LeftoverAction = 'used' | 'wasted' | 'frozen' | 'moved';

export interface LeftoverChange {
  action: LeftoverAction;
  /** Portions eaten or thrown away. Ignored for 'frozen' and 'moved'. */
  portions?: number;
  /** For 'moved': the new place. 'frozen' always means the freezer. */
  location?: StorageLocation;
  at: Date;
  /** Household-local date, YYYY-MM-DD. */
  localDate: string;
  note?: string;
}

/** A guide for how many days a leftover is usually kept; shown as a hint, never as a safety claim. */
export const KEEP_DAYS: Record<StorageLocation, number | null> = { fridge: 3, freezer: 90, shelf: 1, counter: 0 };

export function newLeftover(input: {
  id: string; name: string; portions: number; localDate: string; at: Date;
  location?: StorageLocation; recipeId?: string; fromEventId?: string;
}): Leftover {
  const portions = Math.max(0, Math.floor(input.portions));
  const location = input.location ?? 'fridge';
  return {
    id: input.id,
    name: input.name,
    ...(input.recipeId ? { recipeId: input.recipeId } : {}),
    ...(input.fromEventId ? { fromEventId: input.fromEventId } : {}),
    portionsMade: portions,
    portionsLeft: portions,
    madeOn: input.localDate,
    location,
    ...(location === 'freezer' ? { frozenOn: input.localDate } : {}),
    log: [{ at: input.at.toISOString(), localDate: input.localDate, kind: 'made', portions }],
  };
}

/** Returns the updated leftover; the original is never changed. Portions never go below zero. */
export function applyLeftover(l: Leftover, change: LeftoverChange): Leftover {
  const eaten = Math.max(0, Math.min(l.portionsLeft, Math.floor(change.portions ?? 0)));
  const entry = (kind: LeftoverAction, portions: number) => ({
    at: change.at.toISOString(), localDate: change.localDate, kind, portions,
    ...(change.note ? { note: change.note } : {}),
  });
  switch (change.action) {
    case 'used':
    case 'wasted':
      if (eaten === 0) return l;
      return { ...l, portionsLeft: l.portionsLeft - eaten, log: [...l.log, entry(change.action, eaten)] };
    case 'frozen':
      return { ...l, location: 'freezer', frozenOn: change.localDate, log: [...l.log, entry('frozen', l.portionsLeft)] };
    case 'moved': {
      const location = change.location ?? l.location;
      if (location === l.location) return l;
      return {
        ...l, location, ...(location === 'freezer' ? { frozenOn: change.localDate } : {}),
        log: [...l.log, entry('moved', l.portionsLeft)],
      };
    }
  }
}

/** Date plus days, in YYYY-MM-DD (calendar arithmetic, no time zones involved). */
export function addDaysTo(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The "use by" to suggest: the explicit one, else a guide from where it is kept. */
export function suggestedUseBy(l: Leftover): string | null {
  if (l.useBy) return l.useBy;
  const days = KEEP_DAYS[l.location];
  if (days === null) return null;
  return addDaysTo(l.location === 'freezer' ? (l.frozenOn ?? l.madeOn) : l.madeOn, days);
}

/** Leftovers still worth showing: portions remain. */
export const stillHere = (all: Leftover[]): Leftover[] => all.filter(l => l.portionsLeft > 0);
