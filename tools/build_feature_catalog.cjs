// Regenerates docs/FEATURES.md from audit/coverage-matrix.json.
// The phase of each row is assigned here, in PHASE_OF_ENTRIES, and nowhere else.
// Run: node tools/build_feature_catalog.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'audit', 'coverage-matrix.json'), 'utf8'));

const PHASES = {
  P0: 'Foundations: data model, units, seed import, safe saving',
  P1: 'Cook from what we have: suggestions, cooking history, a recipe for every dish',
  P2: 'Gemini: new-dish lookup, internet recipes, photo pantry and receipts',
  P3: 'Plan the week and shop',
  P4: 'Kitchen depth: locations, batches, expiry, leftovers, waste',
  P5: 'Household, history and insights',
};

const PHASE_OF_ENTRIES = [
  ['P0', [9, 38, 44, 58, 59, 69, 74]],
  ['P1', [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
       31, 32, 39, 40, 41, 42, 43, 45, 46, 47, 48, 50, 51, 53, 56, 61, 62, 63, 77]],
  ['P1', [79, 81, 82]],
  ['P2', [80, 78, 28, 29, 30, 52, 57, 73]],
  ['P3', [33, 34, 35, 36, 37, 49, 54, 55, 60, 71, 72, 83, 84]],
  ['P4', [65, 66, 67, 68, 76]],
  ['P5', [64, 70, 75]],
];

// Requirements Aly added after Codex's review. IDs continue after the matrix.
const ADDED_ROWS = [
  { id: 78, group: 'Aly 2026-10-04', feature: 'A recipe from the internet for every dish', priorWorkflow: 'Missing', legacyApp: 'Partial',
    futureAction: 'Every dish opens a recipe. Use the saved video or written link when there is one; otherwise find one on the web (Gemini with Google Search), show the source link and a short summary, and let Noor keep or replace it. Link to the source rather than copying its full text. Rank written recipes and YouTube videos by rating, views, and Reddit and YouTube-comment feedback, and show those reasons beside each choice; show "not verified" when a number could not be checked. Recheck saved links periodically (Aly, 2026-10-04).' },
  { id: 79, group: 'Aly 2026-10-04', feature: 'Cooking frequency analysis', priorWorkflow: 'Missing', legacyApp: 'Partial',
    futureAction: 'From the cooking history: how often each dish is cooked per week and month, when it was last cooked, dishes not cooked for a while, and the mix by meal type, for any date range.' },
  { id: 80, group: 'Aly 2026-10-04', feature: 'Add a new dish by name, looked up live', priorWorkflow: 'Missing', legacyApp: 'Partial',
    futureAction: 'Noor types a dish name in any spelling or language (Qorma or Korma, Karelay or Karela, Urdu). The app first checks her own collection so she does not add a duplicate, then shows a short list of matching dishes and recipes found online, each with its source, rating and video, and Noor picks the one she wants. The app then loads its ingredients with amounts and units matched to her pantry items, checks whether current stock is enough for the chosen servings, lists what is missing, and shows the best-ranked written recipe and video (F78). She reviews and edits the ingredients before saving; the dish then joins her collection and cooking history like any other. Needs internet; v3 only allows typing a recipe by hand.' },
  { id: 81, group: 'Aly 2026-10-04', feature: 'Suggest the next meal', priorWorkflow: 'Missing', legacyApp: 'Partial',
    futureAction: 'Today opens with one suggested dish for the next meal slot, ranked by what is in stock, how long since it was last cooked, and what the family liked ("Did everyone like it?" after cooking: Loved it / It was ok / Not again, plus favourites). Shows its reasons; Noor taps yes to cook or "Show another". The meal calendar can suggest the rest of the week the same way. Runs on the phone, no internet needed.' },
  { id: 82, group: 'Aly 2026-10-04', feature: 'Pick meal date and time from a calendar', priorWorkflow: 'Missing', legacyApp: 'Partial',
    futureAction: 'When recording or planning a meal, Noor taps a day on a week strip or opens the full calendar, and taps a time (household slot times such as 8:00 am, 1:30 pm, 5:00 pm, 8:30 pm, editable in Settings). Stored as the household-local date and time (D5).' },
  { id: 83, group: 'Aly 2026-10-04', feature: 'Eat-out favourites and ordering', priorWorkflow: 'Missing', legacyApp: 'Missing',
    futureAction: 'Noor keeps favourite dine-out dishes with the restaurant name and area. When she is not in the mood to cook, the app suggests one (favourites, not ordered recently) and opens it: the restaurant’s saved foodpanda link opens that restaurant directly (in the foodpanda app if the phone hands the link to it); with no saved link, the app copies the restaurant name and opens foodpanda so she can paste it into search. Directions open the phone’s maps. Foodpanda has no documented way to pre-fill its search box; app hand-off is unverified on Noor’s phone.' },
  { id: 84, group: 'Aly 2026-10-04', feature: 'Order by mood', priorWorkflow: 'Missing', legacyApp: 'Missing',
    futureAction: 'Eat-out screen starts with mood buttons (Pasta, Pizza, BBQ, Karahi, Chinese, Korean wings, Handi, Burgers, Donuts, Croissants, Desserts, and + More for Noor’s own). Tapping one shows only matching places: Noor’s favourites first, then the best-rated restaurants near home for that mood with rating, delivery time and starting price, each with Order; plus one button opening foodpanda’s own list for that cuisine. Data source (D-13, decided): a free script (tools/eatout/refresh_moods.mjs) reads foodpanda’s restaurant listing weekly from Aly’s computer; the phone reads the saved list. First run 2026-10-04: 9 of 11 moods filled; Korean wings (0) and Donuts (1) need menu-level matching.' },
];
matrix.rows.push(...ADDED_ROWS);

const phaseById = new Map();
for (const [phase, ids] of PHASE_OF_ENTRIES) {
  for (const id of ids) {
    if (phaseById.has(id)) throw new Error(`Row ${id} is assigned to two phases`);
    phaseById.set(id, phase);
  }
}
const missing = matrix.rows.filter(r => !phaseById.has(r.id)).map(r => r.id);
if (missing.length) throw new Error(`Rows without a phase: ${missing.join(', ')}`);

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const out = [
  '# Feature catalogue',
  '',
  '<!-- Generated by tools/build_feature_catalog.cjs from audit/coverage-matrix.json. Do not edit by hand; change PHASE_OF_ENTRIES or ADDED_ROWS in the script and re-run it. -->',
  '',
  `All ${matrix.rows.length} capabilities: F1 to F77 from Codex's coverage review (2026-10-04), F78 onwards added by Aly, grouped by delivery phase.`,
  'Row numbers are the matrix IDs, so tickets, commits and the review can refer to them as `F<n>` (for example `F43`).',
  '',
  'Status columns come from the review: **Prior** is the earlier short workflow, **v3** is `sources/Noor_Kitchen_App_v3.html`',
  '(Present = in the source, Verified = observed working in a browser, Partial, Broken, Missing, Source only).',
  '',
];
for (const [phase, title] of Object.entries(PHASES)) {
  const rows = matrix.rows.filter(r => phaseById.get(r.id) === phase);
  out.push(`## ${phase}: ${title} (${rows.length})`, '', '| ID | Feature | Origin | Prior | v3 | What to build |', '|---|---|---|---|---|---|');
  for (const r of rows) {
    out.push(`| F${r.id} | ${cell(r.feature)} | ${cell(r.group)} | ${cell(r.priorWorkflow)} | ${cell(r.legacyApp)} | ${cell(r.futureAction)} |`);
  }
  out.push('');
}
fs.writeFileSync(path.join(root, 'docs', 'FEATURES.md'), out.join('\n'));
console.log(`Wrote docs/FEATURES.md with ${matrix.rows.length} rows`);
