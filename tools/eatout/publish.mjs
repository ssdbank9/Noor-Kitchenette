// Pure helpers for refresh_moods.mjs (no network, no files), kept apart so tests can import them.
//
// PRIVACY (D-22): the repo is public. A restaurant's own latitude/longitude is public business
// data and IS kept, as `lat`/`lng` rounded to 4 decimals (about 11 m). What must never be written
// is the HOME / SEARCH-CENTRE location (the NOOR_HOME_LAT / NOOR_HOME_LNG values): the published
// list shows the household is near I-8 Markaz (Aly accepted this), and nothing finer. Distance
// (measured from home) and delivery time are dropped, and links lose their query string and
// fragment, because foodpanda links can carry the latitude and longitude of the search.

export const round4 = n => Math.round(n * 10_000) / 10_000;

/** A restaurant coordinate pair, rounded to 4 decimals, or {} when missing or out of range. */
export function placeCoords(latitude, longitude) {
  const la = typeof latitude === 'string' && latitude.trim() !== '' ? Number(latitude) : latitude;
  const lo = typeof longitude === 'string' && longitude.trim() !== '' ? Number(longitude) : longitude;
  const ok = typeof la === 'number' && typeof lo === 'number' && Number.isFinite(la) && Number.isFinite(lo)
    && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
  return ok ? { lat: round4(la), lng: round4(lo) } : {};
}

// The only coordinate-like keys allowed are a restaurant's own lat and lng.
const ALLOWED_KEYS = new Set(['lat', 'lng']);
const LOCATION_KEY = /^(lat|lng|lon|long|latitude|longitude|home|centre|center|search|origin|coords?|location|position)/i;

export function publicUrl(u) {
  if (typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return null;
    x.search = '';
    x.hash = '';
    return x.toString();
  } catch { return null; }
}

/** Throws when the text would give away the home / search centre. */
export function assertNoHomeLocation(text, home) {
  const keys = [...text.matchAll(/"([A-Za-z_]+)":/g)].map(m => m[1]);
  if (keys.some(k => LOCATION_KEY.test(k) && !ALLOWED_KEYS.has(k))) {
    throw new Error('the public list would contain a location key other than a restaurant lat/lng; not writing it');
  }
  const homeValues = [home?.lat, home?.lng].filter(n => typeof n === 'number' && Number.isFinite(n));
  const numbers = [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => Number(m[0]));
  if (numbers.some(n => homeValues.some(h => n === h || n === Math.abs(h)))) {
    throw new Error('the public list contains the home / search-centre coordinates; not writing it');
  }
}

/**
 * The copy that goes in the public repo: name, rating, reviews, budget category, cuisines, link
 * (query stripped) and the restaurant's own lat/lng. Refuses (throws) if the home location is in it.
 */
export function publicList(list, home) {
  const moods = {};
  for (const [mood, places] of Object.entries(list.moods)) {
    moods[mood] = places.map(p => ({
      name: p.name, rating: p.rating, reviews: p.reviews, budget: p.budget,
      cuisines: p.cuisines, url: publicUrl(p.url),
      ...placeCoords(p.lat, p.lng),
    }));
  }
  const out = { generatedAt: list.generatedAt, source: list.source, minReviews: list.minReviews, moods };
  assertNoHomeLocation(JSON.stringify(out), home);
  return out;
}
