// Household-local calendar dates (fixes v3 defect D5).
// v3 stored meals with new Date().toISOString().slice(0, 10), which is the UTC date, so a
// meal at 1:30 a.m. on 1 October in Karachi was filed under 30 September. Every event
// stores the household's local date instead, computed here.

export const HOUSEHOLD_TIME_ZONE = 'Asia/Karachi';

/** The household's calendar date for an instant, as YYYY-MM-DD. */
export function householdDate(instant: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The household's month for an instant, as YYYY-MM, for monthly summaries. */
export function householdMonth(instant: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  return householdDate(instant, timeZone).slice(0, 7);
}

/** "Sunday · 4 October" in the household's time zone. */
export function formatHouseholdDay(instant: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(instant);
  const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long' }).format(instant);
  return `${weekday} · ${dayMonth}`;
}
