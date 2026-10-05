// Refreshes the "order by mood" list (F84, D-13) from foodpanda's restaurant listing.
// Free: no account or token. Run on Aly's computer about once a week:
//
//   NOOR_HOME_LAT=33.70 NOOR_HOME_LNG=73.04 node tools/eatout/refresh_moods.mjs
//   node tools/eatout/refresh_moods.mjs --list-cuisines   (prints cuisine ids near home)
//   npm run refresh:eatout   (from app/; same as adding --publish, see below)
//
// --publish ALSO writes app/public/eatout/moods.json, the copy the app ships and reads
// offline. Aly decides whether to commit and publish it (README, "Eat out list").
//
// Home coordinates come from the environment, never from the repo (the repo is public).
// Output goes to data/eatout/moods.json, which is gitignored.
// Polite by design: one listing request per cuisine, a pause between requests, and no
// retries on a refusal. If foodpanda starts refusing (403 or a challenge page), stop: do
// not work around it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const config = JSON.parse(fs.readFileSync(path.join(here, 'moods.json'), 'utf8'));

const lat = Number(process.env.NOOR_HOME_LAT);
const lng = Number(process.env.NOOR_HOME_LNG);
if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.error('Set NOOR_HOME_LAT and NOOR_HOME_LNG to the home location first.');
  process.exit(2);
}

const PAUSE_MS = 3000;
const PER_REQUEST = 48;
const KEEP = 10;
const MIN_REVIEWS = Number(process.env.NOOR_MIN_REVIEWS ?? 100);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function listing(cuisineId) {
  const url = new URL('https://disco.deliveryhero.io/listing/api/v1/pandora/vendors');
  const params = {
    latitude: lat, longitude: lng, language_id: 1, include: 'characteristics',
    dynamic_pricing: 0, configuration: 'Variant1', country: 'pk', vertical: 'restaurants',
    limit: PER_REQUEST, offset: 0, sort: 'rating_desc',
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  if (cuisineId != null) url.searchParams.set('cuisine', String(cuisineId));
  const res = await fetch(url, {
    headers: { 'x-disco-client-id': 'web', 'accept': 'application/json',
      'user-agent': 'NoorsKitchen/0.1 (household meal planner; weekly)' },
  });
  if (!res.ok) throw new Error(`foodpanda listing refused the request (HTTP ${res.status}); stopping`);
  const body = await res.json();
  if (!body?.data) throw new Error('unexpected listing response; stopping');
  return body.data;
}

const toPlace = v => ({
  name: v.name,
  rating: v.rating,
  reviews: v.review_number,
  deliveryMinutes: v.minimum_delivery_time,
  budget: v.budget,
  cuisines: (v.cuisines || []).map(c => c.name),
  distanceKm: v.distance != null ? Math.round(v.distance * 10) / 10 : null,
  url: v.redirection_url || (v.code && v.url_key ? `https://foodpanda.pk/restaurant/${v.code}/${v.url_key}` : null),
});

if (process.argv.includes('--list-cuisines')) {
  const data = await listing(null);
  for (const c of data.aggregations?.cuisines || []) console.log(`${c.id}\t${c.title}`);
  process.exit(0);
}

const cuisineIds = [...new Set(config.moods.flatMap(m => m.cuisines))];
const byCuisine = new Map();
for (const [i, id] of cuisineIds.entries()) {
  if (i) await sleep(PAUSE_MS);
  const data = await listing(id);
  byCuisine.set(id, (data.items || []).filter(v => v.is_active !== false));
  console.log(`cuisine ${id}: ${data.items?.length ?? 0} of ${data.available_count ?? '?'} nearby`);
}

const moods = {};
for (const m of config.moods) {
  const re = m.match ? new RegExp(m.match, 'i') : null;
  const seen = new Set();
  const places = [];
  for (const id of m.cuisines) {
    for (const v of byCuisine.get(id) || []) {
      if (seen.has(v.code)) continue;
      if (re && !re.test([v.name, ...(v.cuisines || []).map(c => c.name)].join(' '))) continue;
      if ((v.review_number ?? 0) < MIN_REVIEWS) continue;
      seen.add(v.code);
      places.push(toPlace(v));
    }
  }
  places.sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews));
  moods[m.mood] = places.slice(0, KEEP);
}

// PRIVACY: the repo is public. The published copy keeps only what the app shows (name, rating,
// reviews, budget category, cuisines, link). Distance and delivery time are dropped (distance
// is measured from the home address, so a list of distances narrows down where the household
// lives), any home coordinates are never written, and the link loses its query string and
// fragment, because foodpanda links can carry the latitude and longitude of the search.
const COORD_KEY = /^(lat|lng|lon|latitude|longitude)/i;
function publicUrl(u) {
  if (typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return null;
    x.search = '';
    x.hash = '';
    return x.toString();
  } catch { return null; }
}
function publicList(list) {
  const moods = {};
  for (const [mood, places] of Object.entries(list.moods)) {
    moods[mood] = places.map(p => ({
      name: p.name, rating: p.rating, reviews: p.reviews, budget: p.budget,
      cuisines: p.cuisines, url: publicUrl(p.url),
    }));
  }
  const out = { generatedAt: list.generatedAt, source: list.source, minReviews: list.minReviews, moods };
  // Belt and braces: refuse to write if a coordinate-like key slipped in.
  const text = JSON.stringify(out);
  const keys = [...text.matchAll(/"([A-Za-z_]+)":/g)].map(m => m[1]);
  if (keys.some(k => COORD_KEY.test(k))) {
    throw new Error('the public list would contain location data; not writing it');
  }
  return out;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'foodpanda.pk restaurant listing (Aly accepted the terms risk, D-13)',
  minReviews: MIN_REVIEWS,
  moods,
};
const file = path.join(root, 'data', 'eatout', 'moods.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
for (const [mood, list] of Object.entries(moods)) console.log(`${mood}: ${list.length} places`);
console.log(`Wrote ${path.relative(root, file)}`);

if (process.argv.includes('--publish')) {
  const pub = path.join(root, 'app', 'public', 'eatout', 'moods.json');
  fs.mkdirSync(path.dirname(pub), { recursive: true });
  fs.writeFileSync(pub, JSON.stringify(publicList(out), null, 2) + '\n');
  console.log(`Wrote ${path.relative(root, pub)} (distance, delivery time and coordinates stripped). Review it before committing.`);
}
