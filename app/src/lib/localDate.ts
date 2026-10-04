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

/** The household's local clock time for an instant, as HH:MM (24-hour). */
export function householdTime(instant: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant for a household-local date and time (YYYY-MM-DD, HH:MM), whatever time zone
 * the phone itself is set to. Two passes handle zones with daylight saving.
 */
export function instantFromHousehold(localDate: string, localTime: string, timeZone: string = HOUSEHOLD_TIME_ZONE): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const [hh, mm] = localTime.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const first = asUtc - offsetMs(new Date(asUtc), timeZone);
  return new Date(asUtc - offsetMs(new Date(first), timeZone));
}

/** The meal slot to suggest for now: the first one not more than 90 minutes past. */
export function nextSlot<S extends string>(nowHHMM: string, slotTimes: Record<S, string>): S {
  const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const now = minutes(nowHHMM);
  const ordered = (Object.keys(slotTimes) as S[]).sort((a, b) => minutes(slotTimes[a]) - minutes(slotTimes[b]));
  return ordered.find(s => minutes(slotTimes[s]) + 90 > now) ?? ordered[0];
}
