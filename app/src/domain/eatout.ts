// Eat out (F83, F84): mood lists from foodpanda, favourites, suggestions and handoff links.
// The restaurant list is UNTRUSTED (a shipped file, or a file Noor imported): every field is
// checked and capped here, and only https links survive. foodpanda's "budget" is a price
// CATEGORY (1 to 3), never an exact price, and the list's delivery time and distance are
// never read or shown (the delivery time was always 45, and a distance in the file would be
// measured from the home address). A place MAY carry its own public lat/lng (business location,
// D-22); the phone works out the distance from the home area itself.
import { boundedNumber, cleanText, safeHttpUrl } from '../gemini/sanitize';
import { distanceKm, validLatLng, type LatLng } from './geo';
import type { Favourite } from './types';

export const BASE_MOODS = ['Pasta', 'Pizza', 'BBQ', 'Karahi', 'Chinese', 'Korean wings', 'Handi', 'Burgers', 'Donuts', 'Croissants', 'Desserts'] as const;

export const FOODPANDA_HOME = 'https://www.foodpanda.pk/';
export const LIST_URL = '/eatout/moods.json';
export const STORAGE_KEY = 'noor.eatout.list';
export const OLD_AFTER_DAYS = 30;
export const PLACES_SHOWN = 10;

const MAX_FILE_CHARS = 1_000_000;
const MAX_MOODS = 40;
const MAX_PLACES_PER_MOOD = 30;
export const MAX_MOOD_CHARS = 30;

export interface EatOutPlace {
  name: string;
  rating: number | null;
  reviews: number | null;
  /** foodpanda's price category: 1, 2 or 3. Not a price. */
  budget: 1 | 2 | 3 | null;
  cuisines: string[];
  /** https only. */
  url: string | null;
  /** The restaurant's public location, or null when the list has none (or an invalid one). */
  lat: number | null;
  lng: number | null;
}

export interface EatOutList {
  /** ISO date-time the list was made. */
  generatedAt: string;
  source: string;
  moods: Record<string, EatOutPlace[]>;
}

/** An https link or null. (sanitize.safeHttpUrl also lets http through; this app does not.) */
export function httpsUrl(value: unknown, max = 500): string | null {
  const u = safeHttpUrl(value);
  return u && u.startsWith('https://') && u.length <= max ? u : null;
}

function parsePlace(raw: unknown): EatOutPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = cleanText(r.name, 80);
  if (!name) return null;
  const rating = boundedNumber(r.rating, 0, 5);
  const reviews = boundedNumber(r.reviews, 0, 10_000_000);
  const budget = boundedNumber(r.budget, 1, 3);
  const at = validLatLng(r.lat, r.lng); // numbers only; a bad or half pair is ignored, the place stays
  return {
    name,
    rating: rating === null ? null : Math.round(rating * 10) / 10,
    reviews: reviews === null ? null : Math.round(reviews),
    budget: budget === null ? null : (Math.round(budget) as 1 | 2 | 3),
    cuisines: Array.isArray(r.cuisines) ? r.cuisines.slice(0, 6).map(c => cleanText(c, 30)).filter(Boolean) : [],
    url: httpsUrl(r.url),
    lat: at ? at.lat : null,
    lng: at ? at.lng : null,
  };
}

export type ParseResult = { ok: true; list: EatOutList } | { ok: false; error: string };

/** Strict: a malformed file is refused whole. Bad single places are dropped. */
export function parseEatOutList(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'This is not a restaurant list file.' };
  const r = raw as Record<string, unknown>;
  const when = typeof r.generatedAt === 'string' ? Date.parse(r.generatedAt) : NaN;
  if (!Number.isFinite(when)) return { ok: false, error: 'The list has no valid date, so it was not used.' };
  const moodsRaw = r.moods;
  if (!moodsRaw || typeof moodsRaw !== 'object' || Array.isArray(moodsRaw)) return { ok: false, error: 'The list has no moods in it.' };
  const entries = Object.entries(moodsRaw as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_MOODS) return { ok: false, error: 'The list has an unexpected number of moods.' };
  const moods: Record<string, EatOutPlace[]> = {};
  for (const [key, value] of entries) {
    const mood = cleanText(key, MAX_MOOD_CHARS);
    if (!mood || !Array.isArray(value)) return { ok: false, error: 'The list is not in the expected shape.' };
    moods[mood] = value.slice(0, MAX_PLACES_PER_MOOD).map(parsePlace).filter((p): p is EatOutPlace => p !== null);
  }
  return { ok: true, list: { generatedAt: new Date(when).toISOString(), source: cleanText(r.source, 120), moods } };
}

export function parseEatOutText(text: string): ParseResult {
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: 'That file is too big to be a restaurant list.' };
  try {
    return parseEatOutList(JSON.parse(text));
  } catch {
    return { ok: false, error: 'That file is not a restaurant list (it could not be read).' };
  }
}

/** Newest generatedAt wins, whole list. A tie goes to the imported one. */
export function pickNewest(shipped: EatOutList | null, imported: EatOutList | null): EatOutList | null {
  if (!shipped) return imported;
  if (!imported) return shipped;
  return Date.parse(imported.generatedAt) >= Date.parse(shipped.generatedAt) ? imported : shipped;
}

// --- loading: shipped file + imported copy (a refreshable cache, not part of backups) ---

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function readImported(storage?: Pick<Storage, 'getItem'>): EatOutList | null {
  try {
    const text = (storage ?? localStorage).getItem(STORAGE_KEY);
    if (!text) return null;
    const r = parseEatOutText(text);
    return r.ok ? r.list : null;
  } catch {
    return null;
  }
}

export function saveImported(list: EatOutList, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    (storage ?? localStorage).setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function clearImported(storage?: Pick<Storage, 'removeItem'>): void {
  try {
    (storage ?? localStorage).removeItem(STORAGE_KEY);
  } catch {
    /* nothing to remove */
  }
}

export async function fetchShipped(fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<EatOutList | null> {
  try {
    const res = await fetcher(LIST_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const r = parseEatOutText(await res.text()); // a missing file may come back as the app's own page: that fails to parse
    return r.ok ? r.list : null;
  } catch {
    return null;
  }
}

export interface LoadedList { list: EatOutList | null; origin: 'shipped' | 'imported' | null }

export async function loadEatOutList(opts: { fetcher?: Fetcher; storage?: Pick<Storage, 'getItem'> } = {}): Promise<LoadedList> {
  const shipped = await fetchShipped(opts.fetcher);
  const imported = readImported(opts.storage);
  const list = pickNewest(shipped, imported);
  return { list, origin: list === null ? null : list === imported ? 'imported' : 'shipped' };
}

// --- showing it ---

export function ageInDays(generatedAt: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(generatedAt)) / 86_400_000);
}
export const isOld = (generatedAt: string, now: Date): boolean => ageInDays(generatedAt, now) > OLD_AFTER_DAYS;

/** "5 Oct 2026" in the household's time zone. */
export function formatListDate(generatedAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(generatedAt));
}

/** "price level Rs" / "price level Rs Rs" / "price level Rs Rs Rs": a category, never "from Rs <amount>". */
export function priceLevelText(budget: number | null): string {
  return budget === null ? '' : `price level ${Array(budget).fill('Rs').join(' ')}`;
}

export function ratingText(p: Pick<EatOutPlace, 'rating' | 'reviews'>): string {
  if (p.rating === null) return 'No rating yet';
  const reviews = p.reviews === null ? '' : ` (${p.reviews.toLocaleString('en-US')} reviews)`;
  return `${p.rating.toFixed(1)}${reviews}`;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type PlaceOrder = 'rating' | 'nearest';

export interface ShownPlace { place: EatOutPlace; km: number | null }

const byRating = (a: EatOutPlace, b: EatOutPlace) => (b.rating ?? -1) - (a.rating ?? -1) || (b.reviews ?? 0) - (a.reviews ?? 0);

/**
 * Up to 10 places for ONE mood, and nothing from any other mood. "rating" keeps the list's own
 * order (best rated first). "nearest" needs a home area: places with coordinates by distance
 * (ties by rating), then places without coordinates, with no distance. The cut to 10 comes after
 * the sort, so the nearest ten of the whole mood are shown.
 */
export function placesForMood(list: EatOutList | null, mood: string, order: PlaceOrder = 'rating', home?: LatLng | null): ShownPlace[] {
  if (!list) return [];
  const key = Object.keys(list.moods).find(k => same(k, mood));
  if (!key) return [];
  const all = list.moods[key];
  if (order !== 'nearest' || !home) return all.slice(0, PLACES_SHOWN).map(place => ({ place, km: null }));
  const withKm: ShownPlace[] = [];
  const without: ShownPlace[] = [];
  for (const place of all) {
    if (place.lat !== null && place.lng !== null) withKm.push({ place, km: distanceKm(home, { lat: place.lat, lng: place.lng }) });
    else without.push({ place, km: null });
  }
  withKm.sort((a, b) => (a.km as number) - (b.km as number) || byRating(a.place, b.place));
  without.sort((a, b) => byRating(a.place, b.place));
  return [...withKm, ...without].slice(0, PLACES_SHOWN);
}

export function favouritesForMood(favs: Favourite[], mood: string): Favourite[] {
  return favs.filter(f => f.moods.some(m => same(m, mood)));
}

/** The base moods, then any extra mood words found on favourites. */
export function allMoods(favs: Favourite[]): string[] {
  const out: string[] = [...BASE_MOODS];
  for (const f of favs) for (const m of f.moods) if (m.trim() && !out.some(x => same(x, m))) out.push(m);
  return out;
}

// --- suggestion: a favourite not ordered recently ---

const dayNumber = (d: string) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

export function daysSince(localDate: string, today: string): number {
  return dayNumber(today) - dayNumber(localDate);
}

export function agoText(localDate: string, today: string): string {
  const d = daysSince(localDate, today);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

/** Favourites ranked for tonight: the selected mood's own first (if any), never-ordered, then longest ago. */
export function rankSuggestions(favs: Favourite[], mood: string | null): Favourite[] {
  const pool = mood && favouritesForMood(favs, mood).length ? favouritesForMood(favs, mood) : favs;
  return [...pool].sort((a, b) => {
    const x = a.lastOrderedOn ?? '', y = b.lastOrderedOn ?? '';
    return x === y ? a.dish.localeCompare(b.dish) : x < y ? -1 : 1; // '' (never) sorts first
  });
}

export function suggestFavourite(favs: Favourite[], mood: string | null, skip: number): Favourite | null {
  const ranked = rankSuggestions(favs, mood);
  return ranked.length ? ranked[((skip % ranked.length) + ranked.length) % ranked.length] : null;
}

export function suggestionReason(f: Favourite, today: string): string {
  return f.lastOrderedOn ? `Your favourite · last ordered ${agoText(f.lastOrderedOn, today)}` : 'Your favourite · not ordered yet';
}

// --- handoff ---

export function directionsUrl(place: string, area?: string): string {
  const q = [cleanText(place, 80), cleanText(area, 60)].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// --- favourite form ---

export interface FavouriteInput { dish: string; place: string; area: string; url: string; moods: string[] }

export function buildFavourite(input: FavouriteInput, id: string, previous?: Favourite): { ok: true; favourite: Favourite } | { ok: false; error: string } {
  const dish = cleanText(input.dish, 80);
  const place = cleanText(input.place, 80);
  if (!dish) return { ok: false, error: 'Type the dish name.' };
  if (!place) return { ok: false, error: 'Type the place name.' };
  const rawUrl = input.url.trim();
  const url = rawUrl ? httpsUrl(rawUrl) : null;
  if (rawUrl && !url) return { ok: false, error: 'The foodpanda link must start with https://' };
  const moods: string[] = [];
  for (const m of input.moods.map(x => cleanText(x, MAX_MOOD_CHARS)).filter(Boolean)) if (!moods.some(x => same(x, m))) moods.push(m);
  const area = cleanText(input.area, 60);
  const favourite: Favourite = {
    id, dish, place, moods: moods.slice(0, 8),
    ...(area ? { area } : {}),
    ...(url ? { url } : {}),
    ...(previous?.lastOrderedOn ? { lastOrderedOn: previous.lastOrderedOn } : {}),
    ...(previous?.note ? { note: previous.note } : {}),
  };
  return { ok: true, favourite };
}
