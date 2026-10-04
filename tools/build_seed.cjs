// Builds app/src/data/seed.json, the starter collection (F9, F38), from the v3 app's
// embedded database. Run: node tools/build_seed.cjs        (writes the file)
//                         node tools/build_seed.cjs --check (fails if the file is stale)
//
// Sources (read-only):
//   audit/html-database.json          the `const DB = {...}` object of
//                                     sources/Noor_Kitchen_App_v3.html line 98, extracted.
//                                     Re-parsed from the HTML below and compared, so the
//                                     extract cannot drift from the app it came from.
//   audit/reconciliation.json         276 recipe-ingredient rows, matched to the workbooks.
//   docs/research/recipe-research-2026-10-04.json   best-rated links (F78).
//   sources/Noor_Kitchen_App_v3.html also gives `CATS` (lines 100-102), each recipe's
//                                     category in v3's recipe tabs.
//
// What each DB.ING tuple position means, from how v3 reads it
// (line numbers are sources/Noor_Kitchen_App_v3.html = audit/html-source-numbered.txt):
//   [0] unit    every amount of that ingredient, pantry and recipe alike, is in this unit:
//               shown after pantry quantities (lines 245, 260, 267), after recipe needs
//               (lines 128, 223), and picks the +/- step size via STEP[unit] (lines 99, 248).
//   [1] aisle   shopping/pantry category; v3 groups by it against
//               AISLES = Produce, Meat, Dairy, Spices/Masala, Pantry/Dry Goods,
//               Canned/Legumes (lines 106, 240, 304, 319).
//   [2] minimum the restock level: an item is "low" when stock < [2] (lines 133, 243) and the
//               shopping list tops it up to twice this (line 134).
//   [3] start   the starting pantry stock: defaultState() fills the pantry with [3]
//               (line 111; line 120 for items added later). New items get [unit, aisle, 1, 0]
//               (line 384): minimum 1, starting stock 0.
// Recipe amounts in R[].ings are in the ingredient's unit [0] (lines 125-128, 223).
//
// Units -> dimension, displayUnit, conversions (types.ts: base units g, ml, pc):
//   g, kg            mass; base g (kg x 1000). displayUnit is the source unit.
//   ml, L            volume; base ml (L x 1000). (None in v3, kept for completeness.)
//   tsp, tbsp on a pourable liquid sold by volume (LIQUIDS: soy sauce, vinegar, kewra water)
//                    volume; base ml, conversions { tbsp: 15, tsp: 5 }: the metric spoon
//                    definitions, exact for any volume.
//   tsp, tbsp on anything else (spices, pastes, flours, sugar, butter, ghee, thick sauces)
//                    count, with the spoon as the counted unit: displayUnit 'tsp' or 'tbsp'
//                    and conversions { tsp: 1 } or { tbsp: 1 }. A spoon of a powder or paste
//                    has no fixed weight, so no gram figure is invented.
//   cup              count, conversions { cup: 1 }. Cup size (250 ml metric or 240 ml US)
//                    is a household rule not yet decided (PLAN section 3, F58), so even cooking
//                    oil and yogurt stay counted in cups until Aly sets one.
//   unit, bunch, sprig, inch, pc, clove(s)
//                    count, conversions { <unit>: 1 }, displayUnit is the source word.
//   Anything else stops the build: a unit is refused, never guessed (F58).
//   In every count case one base piece is one of the source unit, so minStock, starting
//   stock and recipe amounts carry over unchanged.
// minStock is [2] converted to base units (kept even when 0, which v3 treats as never low).
// Starting stock: when [3] > 0, one 'set-stock' event per ingredient, delta [3] in base
// units, basis 'estimate' because nobody confirmed it. [3] = 0 gives no event.
// Order: ingredients, recipes and events keep the source order; output is 2-space JSON
// with a trailing newline, so the same inputs always give the same bytes.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SEED_PATH = path.join(root, 'app', 'src', 'data', 'seed.json');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = rel => JSON.parse(read(rel));

const SEED_INSTANT = '2026-10-04T00:00:00Z';
const SEED_LOCAL_DATE = '2026-10-04';
const SEED_LOCAL_TIME = '05:00';
const TIME_ZONE = 'Asia/Karachi';

const EXPECTED = { recipes: 22, ingredients: 62 };

const METRIC = { g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], L: ['volume', 1000] };
const SPOON_ML = { tbsp: 15, tsp: 5 };
const COUNT_UNITS = new Set(['unit', 'pc', 'bunch', 'sprig', 'inch', 'clove', 'cloves', 'cup', 'tsp', 'tbsp']);
const LIQUIDS = new Set(['Soy_Sauce', 'Vinegar', 'Kewra_Water']);

// Other names Noor may type or say (F38, F69). Only names that are certain; lower case.
const ALIASES = {
  Onion: ['pyaz'],
  Tomato: ['tamatar'],
  Potato: ['aloo', 'aalu'],
  Green_Chilli: ['hari mirch', 'green chili'],
  Fresh_Coriander: ['dhania', 'hara dhania', 'cilantro'],
  Mint: ['pudina'],
  Ginger: ['adrak'],
  Lemon: ['nimbu'],
  Okra_Bhindi: ['okra', 'bhindi'],
  Cauliflower_Gobi: ['cauliflower', 'gobi', 'phool gobi'],
  Bitter_Gourd_Karela: ['bitter gourd', 'karela', 'karelay'],
  Mustard_Greens_Saag: ['mustard greens', 'saag', 'sarson'],
  Spinach: ['palak'],
  Cabbage: ['band gobi'],
  Carrot: ['gajar'],
  Capsicum: ['shimla mirch', 'bell pepper'],
  Spring_Onion: ['hara pyaz', 'green onion'],
  Curry_Leaves: ['kari patta'],
  Chicken: ['murghi'],
  Beef_Mince: ['qeema', 'keema'],
  Yogurt: ['yoghurt', 'dahi'],
  Butter: ['makhan'],
  Eggs: ['egg', 'anda'],
  Salt: ['namak'],
  Red_Chilli_Powder: ['lal mirch'],
  Turmeric_Powder: ['haldi'],
  Coriander_Powder: ['dhania powder'],
  Cumin_Seeds: ['zeera', 'jeera'],
  Coriander_Seeds: ['sabut dhania'],
  Fennel_Seeds: ['saunf'],
  Garam_Masala_Powder: ['garam masala'],
  Black_Pepper_Powder: ['kali mirch'],
  Whole_Spices_Mix: ['sabut garam masala'],
  Dried_Fenugreek_Leaves: ['kasuri methi'],
  Basmati_Rice: ['chawal'],
  Cooking_Oil: ['oil'],
  Ginger_Garlic_Paste: ['adrak lehsan paste'],
  Fried_Onion: ['birista'],
  Wheat_Flour_Atta: ['atta', 'wheat flour'],
  Gram_Flour_Besan: ['besan', 'gram flour'],
  Cornflour: ['cornstarch'],
  Soy_Sauce: ['soya sauce'],
  Vinegar: ['sirka'],
  Kewra_Water: ['kewra'],
  Maize_Flour_Makai: ['makai ka atta', 'maize flour'],
  Sugar: ['cheeni'],
  Chicken_Stock_Cube: ['stock cube'],
  Chana_Daal: ['chana dal'],
  Mash_Daal: ['maash daal', 'urad dal'],
  Masoor_Daal: ['masoor dal'],
  Moong_Daal: ['moong dal'],
  Red_Kidney_Beans: ['lal lobia', 'rajma'],
};

const SMALL_WORDS = new Set(['with', 'and', 'of', 'in']);
const nameOf = id => id.split('_')
  .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(' ');

const round = x => Math.round(x * 1e6) / 1e6;

// Same comparison as tools/build_recipe_sources.cjs, so the seed agrees with RECIPE_SOURCES.md.
const normUrl = u => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function classify(id, unit) {
  if (METRIC[unit]) {
    const [dimension, factor] = METRIC[unit];
    return { dimension, factor };
  }
  if (SPOON_ML[unit] && LIQUIDS.has(id)) {
    return { dimension: 'volume', factor: SPOON_ML[unit], conversions: { ...SPOON_ML } };
  }
  if (COUNT_UNITS.has(unit)) {
    return { dimension: 'count', factor: 1, conversions: { [unit]: 1 } };
  }
  throw new Error(`${id}: unit '${unit}' is not classified; add a rule instead of guessing`);
}

function v3Embedded() {
  const html = read('sources/Noor_Kitchen_App_v3.html');
  const db = html.match(/^const DB = (\{.*\});\s*$/m);
  const cats = html.match(/const CATS=(\{[\s\S]*?\});/);
  if (!db || !cats) throw new Error('could not find DB or CATS in sources/Noor_Kitchen_App_v3.html');
  return { DB: JSON.parse(db[1]), CATS: JSON.parse(cats[1]) };
}

function buildSeed() {
  const db = readJson('audit/html-database.json');
  const reconciliation = readJson('audit/reconciliation.json');
  const research = readJson('docs/research/recipe-research-2026-10-04.json');
  const v3 = v3Embedded();

  const types = read('app/src/domain/types.ts').match(/export const SCHEMA_VERSION = (\d+);/);
  if (!types) throw new Error('SCHEMA_VERSION not found in app/src/domain/types.ts');
  const schemaVersion = Number(types[1]);

  assert.deepEqual(db, v3.DB, 'audit/html-database.json differs from the DB in the v3 HTML');
  const ingIds = Object.keys(db.ING);
  assert.equal(ingIds.length, EXPECTED.ingredients, 'ingredient count');
  assert.equal(db.R.length, EXPECTED.recipes, 'recipe count');
  const rows = db.R.reduce((n, r) => n + r.ings.length, 0);
  assert.equal(rows, reconciliation.recipe_ingredient_rows, 'recipe-ingredient rows vs audit/reconciliation.json');
  for (const id of Object.keys(ALIASES)) assert.ok(db.ING[id], `alias table names unknown ingredient ${id}`);
  for (const id of LIQUIDS) assert.ok(db.ING[id] && SPOON_ML[db.ING[id][0]], `${id} is not a spoon-measured ingredient`);

  const categoryOf = {};
  for (const [cat, ids] of Object.entries(v3.CATS)) {
    for (const id of ids) {
      assert.ok(!categoryOf[id], `${id} is in two v3 categories`);
      categoryOf[id] = cat;
    }
  }
  const researchById = new Map(research.dishes.map(d => [d.id, d]));

  const ingredients = [];
  const events = [];
  const factorOf = {};
  for (const id of ingIds) {
    const [unit, aisle, min, start] = db.ING[id];
    assert.ok(typeof aisle === 'string' && aisle, `${id}: aisle`);
    assert.ok(Number.isFinite(min) && min >= 0, `${id}: minimum ${min}`);
    assert.ok(Number.isFinite(start) && start >= 0, `${id}: starting stock ${start}`);
    const { dimension, factor, conversions } = classify(id, unit);
    factorOf[id] = factor;
    const ingredient = {
      id,
      name: nameOf(id),
      aliases: ALIASES[id] || [],
      dimension,
      displayUnit: unit,
      aisle,
      minStock: round(min * factor),
    };
    if (conversions) ingredient.conversions = conversions;
    ingredients.push(ingredient);
    if (start > 0) {
      events.push({
        id: `seed-${id}`,
        kind: 'set-stock',
        at: SEED_INSTANT,
        localDate: SEED_LOCAL_DATE,
        localTime: SEED_LOCAL_TIME,
        timeZone: TIME_ZONE,
        movements: [{ ingredientId: id, delta: round(start * factor), basis: 'estimate' }],
        source: 'typed',
        note: 'Starting stock from the v3 app; never confirmed.',
      });
    }
  }

  const recipes = db.R.map(r => {
    assert.ok(Number.isFinite(r.serves) && r.serves > 0, `${r.id}: serves`);
    assert.ok(categoryOf[r.id], `${r.id}: no v3 category`);
    assert.ok(db.VIDEO[r.id], `${r.id}: no video link`);
    const found = researchById.get(r.id);
    assert.ok(found, `${r.id}: no research entry`);
    const rec = found.recommended || {};
    const recipe = {
      id: r.id,
      name: r.name,
      serves: r.serves,
      time: r.time,
      notes: r.notes,
      category: categoryOf[r.id],
      writtenUrl: r.url,
      videoUrl: db.VIDEO[r.id],
    };
    if (rec.written_url && normUrl(rec.written_url) !== normUrl(r.url)) recipe.recommendedWrittenUrl = rec.written_url;
    if (rec.video_url && normUrl(rec.video_url) !== normUrl(db.VIDEO[r.id])) recipe.recommendedVideoUrl = rec.video_url;
    recipe.ingredients = r.ings.map(([ingredientId, amount]) => {
      assert.ok(db.ING[ingredientId], `${r.id}: unknown ingredient ${ingredientId}`);
      assert.ok(Number.isFinite(amount) && amount > 0, `${r.id}/${ingredientId}: amount ${amount}`);
      return { ingredientId, amount, unit: db.ING[ingredientId][0] };
    });
    recipe.version = 1;
    return recipe;
  });
  for (const id of Object.keys(categoryOf)) assert.ok(db.R.some(r => r.id === id), `v3 category lists unknown recipe ${id}`);

  return {
    schemaVersion,
    ingredients,
    recipes,
    events,
    settings: {
      householdName: "Noor's Kitchen",
      timeZone: TIME_ZONE,
      defaultServings: 4,
      slotTimes: { breakfast: '08:00', lunch: '13:30', chai: '17:00', dinner: '20:30' },
    },
  };
}

const serializeSeed = seed => JSON.stringify(seed, null, 2) + '\n';

module.exports = { buildSeed, serializeSeed, SEED_PATH };

if (require.main === module) {
  const text = serializeSeed(buildSeed());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(SEED_PATH) ? fs.readFileSync(SEED_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== text) {
      console.error('app/src/data/seed.json is out of date: run node tools/build_seed.cjs');
      process.exit(1);
    }
    console.log('app/src/data/seed.json is up to date');
  } else {
    fs.mkdirSync(path.dirname(SEED_PATH), { recursive: true });
    fs.writeFileSync(SEED_PATH, text);
    const seed = JSON.parse(text);
    const rowCount = seed.recipes.reduce((n, r) => n + r.ingredients.length, 0);
    const byDim = {};
    for (const i of seed.ingredients) byDim[i.dimension] = (byDim[i.dimension] || 0) + 1;
    console.log(`Wrote app/src/data/seed.json: ${seed.recipes.length} recipes, ${seed.ingredients.length} ingredients, ` +
      `${rowCount} recipe-ingredient rows, ${seed.events.length} starting-stock events`);
    console.log(`Dimensions: ${Object.entries(byDim).map(([d, n]) => `${d} ${n}`).join(', ')}`);
  }
}
