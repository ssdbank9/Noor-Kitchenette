// Leftovers made by cooking, and which ones to use soon (F65). Builds on the shared rules in
// leftovers.ts and never changes them. Use-by dates are a guide, never a food-safety claim.
import { addDaysTo, newLeftover, stillHere, suggestedUseBy } from './leftovers';
import type { Leftover, StorageLocation } from './types';

/** The leftover id for a cook event: derived, so saving the same cook twice never doubles it. */
export const leftoverIdForCook = (eventId: string): string => `lo-${eventId}`;

/** The leftover a cook event made, or null when no portions were left. */
export function leftoverFromCook(
  event: { id: string; at: string; localDate: string },
  recipe: { id: string; name: string },
  portions: number,
  location: StorageLocation = 'fridge',
): Leftover | null {
  if (!(portions >= 1)) return null;
  return newLeftover({
    id: leftoverIdForCook(event.id), name: recipe.name, portions, localDate: event.localDate, at: new Date(event.at),
    location, recipeId: recipe.id, fromEventId: event.id,
  });
}

export interface UseSoonLeftover { leftover: Leftover; useBy: string; daysLeft: number }

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** Leftovers whose "use by" guide is within `days` days or already past, most urgent first. */
export function leftoversUseSoon(all: Leftover[], today: string, days = 2): UseSoonLeftover[] {
  const last = addDaysTo(today, days);
  return stillHere(all)
    .map(leftover => ({ leftover, useBy: suggestedUseBy(leftover) }))
    .filter((x): x is { leftover: Leftover; useBy: string } => x.useBy !== null && x.useBy <= last)
    .map(x => ({ ...x, daysLeft: dayNumber(x.useBy) - dayNumber(today) }))
    .sort((a, b) => a.useBy.localeCompare(b.useBy) || a.leftover.id.localeCompare(b.leftover.id));
}

/** "8 Oct" for a YYYY-MM-DD date. */
export function prettyDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/** "today", "tomorrow", "in 2 days", "1 day ago" for a days-left number. */
export function dueText(daysLeft: number): string {
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft > 1) return `in ${daysLeft} days`;
  return `${-daysLeft} ${daysLeft === -1 ? 'day' : 'days'} ago`;
}
