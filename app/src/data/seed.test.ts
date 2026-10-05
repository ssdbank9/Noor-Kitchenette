import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Dimension, type Ingredient } from '../domain/types';
import { demoPantry } from './demoPantry';
import { seed } from './seed';

// The app has no @types/node, so Node built-ins are loaded untyped.
const nodeImport = (id: string): Promise<any> => import(/* @vite-ignore */ id);

const METRIC: Record<Dimension, string[]> = { mass: ['g', 'kg'], volume: ['ml', 'L'], count: ['pc'] };
const resolvable = (ing: Ingredient, unit: string) =>
  METRIC[ing.dimension].includes(unit) || ing.conversions?.[unit] !== undefined;

const byId = new Map(seed.ingredients.map(i => [i.id, i]));
const eventFor = (id: string) => demoPantry.find(e => e.movements.some(m => m.ingredientId === id));
const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe('starter collection seed (F9, F38)', () => {
  it('has the counts reconciled in audit/reconciliation.json', () => {
    expect(seed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(seed.schemaVersion).toBe(1);
    expect(seed.recipes).toHaveLength(22);
    // 62 from the workbooks plus the owner's extra staples (Buldak noodles and four snacks, D-22).
    expect(seed.ingredients).toHaveLength(67);
    expect(seed.ingredients.filter(i => !i.id.includes('_') || i.id === 'Buldak_Noodles').length).toBeGreaterThan(0);
    expect(seed.recipes.reduce((n, r) => n + r.ingredients.length, 0)).toBe(276);
  });

  it('keeps ids unique and unchanged, including the daal variants', () => {
    expect(unique(seed.ingredients.map(i => i.id))).toBe(true);
    expect(unique(seed.recipes.map(r => r.id))).toBe(true);
    expect(unique(demoPantry.map(e => e.id))).toBe(true);
    const ids = seed.recipes.map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining(['R001', 'R006a', 'R006b', 'R006c', 'R020']));
    expect(seed.recipes.find(r => r.id === 'R006c')?.name).toBe('Daal Masoor (Malka)');
    expect(byId.has('Masoor_Daal')).toBe(true);
  });

  it('gives every recipe its servings, time, notes, links and version 1', () => {
    for (const r of seed.recipes) {
      expect(r.serves, r.id).toBeGreaterThan(0);
      expect(r.time, r.id).toBeTruthy();
      expect(r.notes, r.id).toBeTruthy();
      expect(r.category, r.id).toBeTruthy();
      expect(r.writtenUrl, r.id).toMatch(/^https:\/\//);
      expect(r.videoUrl, r.id).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(r.version, r.id).toBe(1);
      expect(r.steps, r.id).toBeUndefined();
      if (r.recommendedWrittenUrl) expect(r.recommendedWrittenUrl, r.id).not.toBe(r.writtenUrl);
      if (r.recommendedVideoUrl) expect(r.recommendedVideoUrl, r.id).not.toBe(r.videoUrl);
    }
  });

  it('points every recipe ingredient at an existing ingredient in that ingredient\'s unit', () => {
    for (const r of seed.recipes) {
      expect(unique(r.ingredients.map(x => x.ingredientId)), r.id).toBe(true);
      for (const x of r.ingredients) {
        const ing = byId.get(x.ingredientId);
        expect(ing, `${r.id} ${x.ingredientId}`).toBeDefined();
        expect(x.amount, `${r.id} ${x.ingredientId}`).toBeGreaterThan(0);
        expect(x.unit, `${r.id} ${x.ingredientId}`).toBe(ing!.displayUnit);
        expect(resolvable(ing!, x.unit), `${r.id} ${x.ingredientId} ${x.unit}`).toBe(true);
      }
    }
  });

  it('can convert every ingredient\'s display unit to its base unit, without guessed weights', () => {
    for (const ing of seed.ingredients) {
      expect(resolvable(ing, ing.displayUnit), ing.id).toBe(true);
      expect(ing.minStock, ing.id).toBeGreaterThanOrEqual(0);
      expect(ing.name, ing.id).toBe(ing.name.trim());
      expect(ing.aisle, ing.id).toBeTruthy();
    }
    // Spices measured by the spoon are counted in spoons, not turned into grams.
    expect(byId.get('Salt')).toMatchObject({ dimension: 'count', displayUnit: 'tsp', conversions: { tsp: 1 } });
    expect(byId.get('Soy_Sauce')).toMatchObject({ dimension: 'volume', displayUnit: 'tbsp', minStock: 45 });
    expect(byId.get('Chicken')).toMatchObject({ dimension: 'mass', displayUnit: 'kg', minStock: 1000 });
    expect(byId.get('Ginger_Garlic_Paste')?.name).toBe('Ginger Garlic Paste');
    expect(byId.get('Beef_Shank_with_Bones')?.name).toBe('Beef Shank with Bones');
  });

  it('keeps aliases lower case and never shared between two ingredients', () => {
    const all = seed.ingredients.flatMap(i => i.aliases);
    expect(unique(all)).toBe(true);
    for (const a of all) expect(a).toBe(a.toLowerCase());
    const names = new Set(seed.ingredients.map(i => i.name.toLowerCase()));
    for (const a of all) expect(names.has(a), a).toBe(false);
    expect(byId.get('Yogurt')?.aliases).toEqual(expect.arrayContaining(['yoghurt', 'dahi']));
  });

  it('keeps no starting stock in the seed (D-18); the sample pantry is only estimated set-stock events with positive amounts', () => {
    expect(seed.events).toEqual([]);
    expect(demoPantry).toHaveLength(46);
    for (const e of demoPantry) {
      expect(e.note, e.id).toBe('Sample pantry for trying the app');
      expect(e.kind, e.id).toBe('set-stock');
      expect(e.movements, e.id).toHaveLength(1);
      const [m] = e.movements;
      expect(e.id).toBe(`sample-${m.ingredientId}`);
      expect(byId.has(m.ingredientId), e.id).toBe(true);
      expect(m.delta, e.id).toBeGreaterThan(0);
      expect(m.setTo, e.id).toBe(m.delta);
      expect(m.basis, e.id).toBe('estimate');
      expect(e).toMatchObject({
        at: '2026-10-04T00:00:00Z', localDate: '2026-10-04', localTime: '05:00',
        timeZone: 'Asia/Karachi', source: 'typed',
      });
    }
    expect(unique(demoPantry.map(e => e.movements[0].ingredientId))).toBe(true);
  });

  it('reads v3 tuples as [unit, aisle, minimum, starting stock]', () => {
    // Onion is ["unit", "Produce", 2, 6] in v3: restock below 2, start with 6.
    expect(byId.get('Onion')).toMatchObject({ displayUnit: 'unit', aisle: 'Produce', minStock: 2 });
    expect(eventFor('Onion')?.movements[0].delta).toBe(6);
    // Macaroni ["g", ..., 250, 500]; Basmati_Rice ["kg", ..., 1, 3] becomes grams.
    expect(byId.get('Macaroni')?.minStock).toBe(250);
    expect(eventFor('Macaroni')?.movements[0].delta).toBe(500);
    expect(eventFor('Basmati_Rice')?.movements[0].delta).toBe(3000);
    expect(eventFor('Soy_Sauce')?.movements[0].delta).toBe(90);
    // Mint ["bunch", "Produce", 1, 0]: no starting stock, so no event.
    expect(eventFor('Mint')).toBeUndefined();
  });

  it('starts the household settings in Karachi for four people', () => {
    expect(seed.settings).toEqual({
      householdName: "Noor's Kitchen",
      timeZone: 'Asia/Karachi',
      defaultServings: 4,
      slotTimes: { breakfast: '08:00', lunch: '13:30', chai: '17:00', dinner: '20:30' },
    });
  });

  it('matches what tools/build_seed.cjs produces now', async () => {
    const { createRequire } = await nodeImport('node:module');
    const { readFileSync } = await nodeImport('node:fs');
    const requireCjs = createRequire(import.meta.url);
    const tool = requireCjs('../../../tools/build_seed.cjs');
    const onDisk: string = readFileSync(tool.SEED_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(tool.serializeSeed(tool.buildSeed()));
    const demoOnDisk: string = readFileSync(tool.DEMO_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(demoOnDisk).toBe(tool.serializeSeed(tool.buildDemoPantry()));
  });
});

describe('extra staples', () => {
  it('Buldak noodles: a count item in packs, kept at 5, matched by its other names', () => {
    const b = seed.ingredients.find(i => i.id === 'Buldak_Noodles')!;
    expect(b).toMatchObject({ dimension: 'count', displayUnit: 'pack', aisle: 'Snacks & noodles', minStock: 5, buyAmount: 5, conversions: { pack: 1 } });
    expect(b.aliases).toContain('samyang');
    expect(seed.recipes.some(r => r.ingredients.some(x => x.ingredientId === 'Buldak_Noodles'))).toBe(false);
  });
});
