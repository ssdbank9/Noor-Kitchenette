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
// Starting stock: when [3] > 0, one 'set-stock' event per ingredient, delta and setTo [3]
// in base units (setTo makes it the starting point the ledger counts from), basis
// 'estimate' because nobody confirmed it. [3] = 0 gives no event.
// Order: ingredients, recipes and events keep the source order; output is 2-space JSON
// with a trailing newline, so the same inputs always give the same bytes.
'use strict';
// Which meal slots each dish suits, so Today never suggests biryani for breakfast.
// Everything is lunch or dinner unless listed here (household judgement, editable later).
const MEALS_OF = {
  R016: ['breakfast', 'lunch', 'dinner'], // Masala Aloo: with puri or paratha at breakfast
  R008: ['chai', 'lunch', 'dinner'],      // Shami Kabab: with chai too
  R017: ['breakfast', 'lunch', 'dinner'], // Aloo Qeema: with paratha at breakfast
  R018: ['breakfast', 'lunch', 'dinner'], // Nihari: a weekend breakfast classic
};
// Home-style cooking steps for every dish (Part 0: the recipes were missing their method —
// the dish page must teach the cooking, not just link out). Written for Noor in simple words;
// draft reviewed with Aly (2026-10-07). The v3 app and workbooks have no steps, so this table
// is the source of the method.
const STEPS = {
  R001: [
    'Soak the rice in water for 30 minutes, then drain.',
    'Fry the onions in hot oil till golden. Add the chicken, ginger garlic paste and biryani masala; cook till the chicken is done.',
    'Add the yogurt and tomatoes; cook till the oil separates.',
    'Boil the drained rice with whole spices until 7/10 done, then drain.',
    'Layer the chicken and rice in one pot. Top with fried onions, mint, coriander and kewra water.',
    'Seal the pot and steam on the lowest heat for 20 minutes. Mix gently before serving.',
  ],
  R002: [
    'Soak the rice for 30 minutes, then drain.',
    'Boil the chicken with whole spices, onion, ginger garlic paste and salt into a strong stock (yakhni). Take the chicken out and keep the stock.',
    'Fry the onions in ghee till golden; add the chicken back.',
    'Add the rice and the hot stock (about double the rice). Cook on high till the water is gone.',
    'Steam on the lowest heat for 15 minutes. Fluff and serve.',
  ],
  R003: [
    'Soak the beans overnight (or boil 10 minutes and rest 1 hour), then drain.',
    'Boil the beans with salt till soft.',
    'Fry the onions in oil till golden. Add ginger garlic paste, tomatoes and the spice powders; cook till soft.',
    'Add the beans with a little of their water; simmer 15 minutes till the gravy is thick.',
    'Top with coriander and serve with roti or rice.',
  ],
  R004: [
    'Fry the chicken in hot oil with ginger garlic paste till it changes colour.',
    'Add the tomatoes, salt, red chilli and turmeric. Cook covered till the tomatoes melt (about 10 minutes).',
    'Add the green chillies, black pepper and garam masala; dry the water on high heat.',
    'Stir in ginger strips and coriander. Serve hot with naan.',
  ],
  R005: [
    'Fry the onions golden, then blend them into a paste.',
    'Fry the chicken with ginger garlic paste and the whole spices.',
    'Add the onion paste, yogurt, coriander powder and salt; cook on low heat till the oil separates.',
    'Add hot water and simmer till the chicken is soft and the gravy is rich.',
    'Sprinkle garam masala and coriander. Serve with roti or rice.',
  ],
  R006a: [
    'Boil the daal with turmeric, salt and a little water till soft.',
    'Fry the onions in oil or ghee till golden. Add ginger garlic paste, tomatoes and the spices; cook till soft.',
    'Mix the daal into the masala; mash lightly and simmer 10 minutes.',
    'Top with coriander, green chillies and a squeeze of lemon. Serve with roti or rice.',
  ],
  R006b: [
    'Boil the daal with turmeric and salt till soft and smooth.',
    'Fry the onions golden; add the tomatoes and spices; cook till soft.',
    'Mix into the daal and simmer 10 minutes.',
    'For the tadka: fry cumin seeds, dried chillies and garlic in hot ghee till brown.',
    'Pour the tadka over the daal. Top with coriander and serve.',
  ],
  R006c: [
    'Boil the daal with turmeric and salt till soft.',
    'Fry the onions golden; add ginger garlic paste, tomatoes and the spices; cook till soft.',
    'Mix into the daal and simmer 10 minutes till creamy.',
    'Top with coriander and lemon. Serve with roti or rice.',
  ],
  R007: [
    'Fry the onions golden; add the beef with ginger garlic paste and the spices; brown it well.',
    'Add the tomatoes and yogurt; cook on high heat till the oil separates.',
    'Add hot water to cover and cook covered till the beef is almost soft (about an hour).',
    'Add the potato chunks; cook 15 more minutes till soft.',
    'Simmer to the gravy you like. Top with coriander and green chillies. Serve with roti or rice.',
  ],
  R008: [
    'Boil the beef mince with chana daal, onions, garlic, whole spices and salt till dry (about 45 minutes).',
    'Cool, then grind to a paste with fresh coriander, mint and green chillies.',
    'Mix well and shape into flat round kababs.',
    'Shallow-fry in hot oil till brown on both sides.',
    'Serve hot with chutney or ketchup.',
  ],
  R009: [
    'Mix the chicken pieces with cornflour, egg, salt and pepper; rest 15 minutes.',
    'Deep-fry or shallow-fry the chicken till golden and cooked through.',
    'Fry the garlic in a little oil; add soy sauce, ketchup, chilli garlic sauce and a splash of water.',
    'Thicken with a little cornflour water; drop the fried chicken in and toss to coat.',
    'Top with spring onions. Serve hot with fried rice.',
  ],
  R010: [
    'Boil the rice with salt till just done; cool it completely (cold rice fries best).',
    'Scramble the eggs in hot oil; take them out.',
    'Fry the chicken with garlic till cooked.',
    'Add the rice, soy sauce, salt and pepper; toss on high heat.',
    'Fold in the eggs and spring onions. Serve hot.',
  ],
  R011: [
    'Fry the garlic and onion in hot oil; add the chicken and cook till white.',
    'Add the pasta, ketchup, chilli garlic sauce, soy sauce and hot water to just cover.',
    'Cook covered, stirring, till the pasta is soft and the sauce is thick (about 12 minutes).',
    'Top with spring onions and black pepper. Serve hot.',
  ],
  R012: [
    'Fry the onions golden; blend them with yogurt into a smooth paste.',
    'Fry the chicken with ginger garlic paste and the spices; add the onion paste and cook till the oil separates.',
    'Boil the macaroni with salt till soft; drain.',
    'Fold the macaroni into the chicken gravy; cook 5 minutes together.',
    'Top with coriander and serve hot.',
  ],
  R013: [
    'Wash and dry the bhindi; slice it. Fry in oil till the stickiness is gone; take out.',
    'Fry the potato cubes in the same oil till golden.',
    'Fry the onions; add the tomatoes, salt, red chilli, turmeric and coriander powder; cook till soft.',
    'Return the bhindi and potatoes; cook covered on low for 10 minutes, stirring gently.',
    'Sprinkle coriander. Serve with roti.',
  ],
  R014: [
    'Boil the cauliflower florets in salted water for 5 minutes; drain.',
    'Fry the onions in oil; add ginger garlic paste, the tomatoes and the spices; cook till soft.',
    'Add the cauliflower; toss to coat and cook covered on low for 10 minutes.',
    'Sprinkle garam masala and coriander. Serve with roti.',
  ],
  R015: [
    'Scrape and salt the karela; rest 1-2 hours, then wash and dry (this removes the bitterness).',
    'Fry the karela in oil till golden; take out.',
    'Fry the onions; add the mince with ginger garlic paste, tomatoes and the spices; cook till dry.',
    'Add the karela back; cook together on low for 10 minutes.',
    'Top with coriander. Serve with roti.',
  ],
  R016: [
    'Boil or fry the potato chunks till nearly soft.',
    'Fry the onions; add the tomatoes, salt, red chilli, turmeric and coriander powder; cook till soft.',
    'Add the potatoes with a splash of water; cook covered for 10 minutes, stirring now and then.',
    'Crush one or two potatoes to thicken the masala. Top with coriander. Serve with roti or puri.',
  ],
  R017: [
    'Fry the onions golden; add the mince with ginger garlic paste; brown it on high heat.',
    'Add the tomatoes, salt, red chilli, turmeric and coriander powder; cook till the oil separates.',
    'Add the potato cubes and a splash of water; cook covered till the potatoes are soft.',
    'Dry the water on high heat; sprinkle garam masala and coriander. Serve with roti.',
  ],
  R018: [
    'Fry the onions golden; add the beef shank with ginger garlic paste and salt; brown it.',
    'Add water and the nihari masala; cook covered on the lowest heat till the beef falls apart (about 3 hours).',
    'For the tarri: heat oil, sprinkle a little flour, add a ladle of nihari and whisk till thick; pour it back.',
    'Simmer 15 more minutes till glossy.',
    'Serve with ginger strips, green chillies, lemon and coriander, with naan.',
  ],
  R019: [
    'Soak the rice and daal together for 30 minutes; drain.',
    'Fry the onions in hot oil or ghee; add ginger garlic paste, the tomatoes and the spices; cook till soft.',
    'Add the rice and daal with hot water (double the rice); cook covered till soft.',
    'Dry on high heat, fluff, and serve with raita or pickle.',
  ],
  R020: [
    'Wash and chop the mustard greens and spinach; boil with salt, green chillies and a little water till very soft (about 1 hour on low).',
    'Churn the greens with a mathni or blender till mostly smooth (leave some texture).',
    'Make the tadka: fry the onions golden in ghee; add garlic, the maize flour and a ladle of saag; cook 10 minutes, stirring.',
    'Pour back into the pot and simmer 20 minutes, stirring so it does not stick.',
    'Top with butter and serve with makai roti.',
  ],
};
const assertSteps = id => {
  const s = STEPS[id];
  assert.ok(Array.isArray(s) && s.length >= 3, `${id}: no cooking steps`);
  return s;
};
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SEED_PATH = path.join(root, 'app', 'src', 'data', 'seed.json');
const DEMO_PATH = path.join(root, 'app', 'src', 'data', 'demoPantry.json');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = rel => JSON.parse(read(rel));

const SEED_INSTANT = '2026-10-04T00:00:00Z';
const SEED_LOCAL_DATE = '2026-10-04';
const SEED_LOCAL_TIME = '05:00';
const TIME_ZONE = 'Asia/Karachi';

const EXPECTED = { recipes: 22, ingredients: 62 };

// Staples added by the owner on top of the workbooks (D-22). They are not in any recipe; they
// exist so they appear on the To-buy list when they run low. Noor loves Buldak noodles: keep 5.
const EXTRA_INGREDIENTS = [
  {
    id: 'Buldak_Noodles',
    name: 'Buldak noodles',
    aliases: ['buldak', 'samyang', 'samyang buldak', 'fire noodles', 'korean noodles', 'korean ramen'],
    dimension: 'count',
    displayUnit: 'pack',
    aisle: 'Snacks & noodles',
    minStock: 5,
    buyAmount: 5,
    conversions: { pack: 1 },
  },
  ...[
    ['Instant_Noodles', 'Instant noodles', ['noodles', 'maggi', 'ramen', 'indomie'], 'pack'],
    ['Chips', 'Chips', ['crisps', 'lays', 'potato chips'], 'pack'],
    ['Biscuits', 'Biscuits', ['cookies', 'biscuit'], 'pack'],
    ['Chocolate', 'Chocolate', ['chocolates', 'candy', 'sweets'], 'bar'],
    ['Frisky', 'Frisky', ['firstky', 'frisky snack'], 'pack'],
  ].map(([id, name, aliases, unit]) => ({
    id, name, aliases, dimension: 'count', displayUnit: unit, aisle: 'Snacks & noodles', minStock: 0, conversions: { [unit]: 1 },
  })),
];


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

function buildAll() {
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
        id: `sample-${id}`,
        kind: 'set-stock',
        at: SEED_INSTANT,
        localDate: SEED_LOCAL_DATE,
        localTime: SEED_LOCAL_TIME,
        timeZone: TIME_ZONE,
        movements: [{ ingredientId: id, delta: round(start * factor), basis: 'estimate', setTo: round(start * factor) }],
        source: 'typed',
        note: 'Sample pantry for trying the app',
      });
    }
  }
  ingredients.push(...EXTRA_INGREDIENTS.map(e => ({ ...e })));

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
      steps: assertSteps(r.id),
      category: categoryOf[r.id],
      meals: MEALS_OF[r.id] ?? ['lunch', 'dinner'],
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

  const demoPantry = events; // the old v3 sample amounts, offered as an optional demo (D-18)
  const seed = {
    schemaVersion,
    ingredients,
    recipes,
    events: [], // D-18: a fresh install starts with an empty pantry
    settings: {
      householdName: "Noor's Kitchen",
      timeZone: TIME_ZONE,
      defaultServings: 4,
      slotTimes: { breakfast: '08:00', lunch: '13:30', chai: '17:00', dinner: '20:30' },
    },
  };
  return { seed, demoPantry };
}

const buildSeed = () => buildAll().seed;
const buildDemoPantry = () => buildAll().demoPantry;
const serializeSeed = seed => JSON.stringify(seed, null, 2) + '\n';

module.exports = { buildSeed, buildDemoPantry, serializeSeed, SEED_PATH, DEMO_PATH };

if (require.main === module) {
  const { seed: built, demoPantry } = buildAll();
  const files = [[SEED_PATH, serializeSeed(built)], [DEMO_PATH, serializeSeed(demoPantry)]];
  if (process.argv.includes('--check')) {
    let stale = false;
    for (const [file, text] of files) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
      if (current !== text) {
        console.error(`${path.relative(root, file)} is out of date: run node tools/build_seed.cjs`);
        stale = true;
      } else {
        console.log(`${path.relative(root, file)} is up to date`);
      }
    }
    if (stale) process.exit(1);
  } else {
    for (const [file, text] of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    const rowCount = built.recipes.reduce((n, r) => n + r.ingredients.length, 0);
    const byDim = {};
    for (const i of built.ingredients) byDim[i.dimension] = (byDim[i.dimension] || 0) + 1;
    console.log(`Wrote app/src/data/seed.json: ${built.recipes.length} recipes, ${built.ingredients.length} ingredients, ` +
      `${rowCount} recipe-ingredient rows, ${built.events.length} starting-stock events`);
    console.log(`Wrote app/src/data/demoPantry.json: ${demoPantry.length} sample-pantry events`);
    console.log(`Dimensions: ${Object.entries(byDim).map(([d, n]) => `${d} ${n}`).join(', ')}`);
  }
}
