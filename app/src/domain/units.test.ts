import { describe, expect, it } from 'vitest';
import type { Ingredient } from './types';
import { KNOWN_UNITS, fromBase, matchIngredient, normaliseUnit, parseQuantityLine, toBase } from './units';

function ingredient(id: string, fields: Partial<Ingredient> & Pick<Ingredient, 'dimension'>): Ingredient {
  return { id, name: id.replace(/_/g, ' '), aliases: [], displayUnit: 'g', aisle: 'Pantry', ...fields };
}

const chicken = ingredient('Chicken', { dimension: 'mass', displayUnit: 'kg', aliases: ['murgh'] });
const rice = ingredient('Basmati_Rice', { name: 'Rice', dimension: 'mass', displayUnit: 'kg', aliases: ['chawal'] });
const riceWithCup = { ...rice, conversions: { cup: 200 } };
const milk = ingredient('Milk', { dimension: 'volume', displayUnit: 'L', aliases: ['doodh'] });
const eggs = ingredient('Eggs', { dimension: 'count', displayUnit: 'pc', aliases: ['anday'] });
const coriander = ingredient('Coriander', { dimension: 'count', displayUnit: 'bunch', conversions: { bunch: 1 } });
const onion = ingredient('Onion', { dimension: 'mass', displayUnit: 'kg', aliases: ['pyaz', 'پیاز'], conversions: { pc: 150 } });
const tomato = ingredient('Tomato', { dimension: 'mass', displayUnit: 'kg', aliases: ['tamatar'] });
const greenChilli = ingredient('Green_Chilli', { dimension: 'count', displayUnit: 'pc', aliases: ['hari mirch'] });
const curryLeaves = ingredient('Curry_Leaves', { dimension: 'count', displayUnit: 'sprig', conversions: { sprig: 1 } });
const masoorDaal = ingredient('Masoor_Daal', { name: 'Red lentils', dimension: 'mass', displayUnit: 'kg' });
const oil = ingredient('Cooking_Oil', { dimension: 'mass', displayUnit: 'g', conversions: { ml: 0.92 } });
const biscuits = ingredient('Biscuits', { dimension: 'mass', displayUnit: 'packet', conversions: { packet: 400 } });
const ALL = [chicken, rice, milk, eggs, coriander, onion, tomato, greenChilli, curryLeaves, masoorDaal, oil, biscuits];

/** Parses a line that must succeed, failing the test with the parser's message if not. */
function parsed(line: string) {
  const result = parseQuantityLine(line);
  if ('error' in result) throw new Error(`expected "${line}" to parse, got: ${result.error}`);
  return result;
}

/** Parses a line that must be refused and returns the message shown to Noor. */
function refused(line: string): string {
  const result = parseQuantityLine(line);
  if (!('error' in result)) throw new Error(`expected "${line}" to be refused, got ${JSON.stringify(result)}`);
  return result.error;
}

function baseValue(amount: number, unit: string, item: Ingredient): number {
  const result = toBase(amount, unit, item);
  if (!result.ok) throw new Error(`expected ${amount} ${unit} of ${item.name} to convert, got: ${result.reason}`);
  return result.value;
}

function refusal(amount: number, unit: string, item: Ingredient): string {
  const result = toBase(amount, unit, item);
  if (result.ok) throw new Error(`expected ${amount} ${unit} of ${item.name} to be refused, got ${result.value}`);
  return result.reason;
}

describe('the v3 paste bug (D2)', () => {
  it('stores "Chicken — 500 g" as 500 grams, not 500 kg', () => {
    const { name, quantity } = parsed('Chicken — 500 g');
    expect(name).toBe('Chicken');
    expect(quantity).toEqual({ amount: 500, unit: 'g', basis: 'measured' });

    const grams = baseValue(quantity.amount!, quantity.unit, chicken);
    expect(grams).toBe(500);
    expect(grams).not.toBe(500_000); // v3 filed it in the display unit: 500 kg
  });

  it('refuses "-2" instead of reading it as 2', () => {
    expect(refused('-2')).toMatch(/cannot be negative/i);
    expect(refused('Eggs -2')).toMatch(/cannot be negative/i);
  });
});

describe('normaliseUnit', () => {
  it.each([
    ['g', 'g'], ['gm', 'g'], ['gms', 'g'], ['Gram', 'g'], ['grams', 'g'],
    ['kg', 'kg'], ['KG', 'kg'], ['Kgs', 'kg'], ['kilo', 'kg'], ['kilos', 'kg'],
    ['ml', 'ml'], ['mls', 'ml'], ['l', 'L'], ['L', 'L'], ['litre', 'L'], ['Litres', 'L'], ['liter', 'L'], ['liters', 'L'],
    ['pc', 'pc'], ['pcs', 'pc'], ['piece', 'pc'], ['Pieces', 'pc'], ['nos', 'pc'], ['unit', 'pc'], ['units', 'pc'],
    ['tsp', 'tsp'], ['teaspoons', 'tsp'], ['tbsp', 'tbsp'], ['Tablespoon', 'tbsp'], ['cup', 'cup'], ['cups', 'cup'],
    ['packet', 'packet'], ['Packets', 'packet'], ['pack', 'packet'], ['packs', 'packet'],
    ['bunch', 'bunch'], ['bunches', 'bunch'], ['pao', 'pao'], ['dozen', 'dozen'], ['dozens', 'dozen'],
    ['inch', 'inch'], ['inches', 'inch'], ['sprig', 'sprig'], ['sprigs', 'sprig'], ['clove', 'clove'], ['cloves', 'clove'],
  ])('reads "%s" as %s', (raw, unit) => {
    expect(normaliseUnit(raw)).toBe(unit);
  });

  it('ignores spaces and dots', () => {
    expect(normaliseUnit('  k g ')).toBe('kg');
    expect(normaliseUnit('tbsp.')).toBe('tbsp');
    expect(normaliseUnit('table spoons')).toBe('tbsp');
  });

  it.each(['grms', 'lbs', 'oz', 'handful', 'eggs', '', '   '])('does not know "%s"', raw => {
    expect(normaliseUnit(raw)).toBeNull();
  });

  it('lists every unit it can return', () => {
    expect(KNOWN_UNITS).toEqual(expect.arrayContaining(['g', 'kg', 'ml', 'L', 'pc', 'dozen', 'cup', 'pao', 'packet']));
    expect(KNOWN_UNITS).not.toContain('pack'); // a spelling of packet, not a unit of its own
  });
});

describe('toBase', () => {
  it('converts g and kg for a mass ingredient', () => {
    expect(baseValue(500, 'g', chicken)).toBe(500);
    expect(baseValue(1.5, 'kg', chicken)).toBe(1500);
    expect(baseValue(1.1, 'kg', chicken)).toBe(1100); // not 1100.0000000000002
  });

  it('converts ml and L for a volume ingredient', () => {
    expect(baseValue(250, 'ml', milk)).toBe(250);
    expect(baseValue(2, 'L', milk)).toBe(2000);
    expect(baseValue(1.5, 'litres', milk)).toBe(1500);
  });

  it('counts pieces and dozens for a count ingredient', () => {
    expect(baseValue(3, 'pc', eggs)).toBe(3);
    expect(baseValue(1, 'dozen', eggs)).toBe(12);
    expect(baseValue(2, 'dozen', eggs)).toBe(24);
    expect(baseValue(0.5, 'dozen', eggs)).toBe(6);
  });

  it('never crosses dimensions without a rule', () => {
    expect(refusal(500, 'ml', chicken)).toMatch(/Chicken is measured by weight, not volume/);
    expect(refusal(1, 'kg', milk)).toMatch(/measured by volume, not weight/);
    expect(refusal(1, 'kg', eggs)).toMatch(/measured by count, not weight/);
    expect(refusal(1, 'dozen', chicken)).toMatch(/measured by weight, not count/);
    expect(refusal(3, 'pc', tomato)).toMatch(/pc needs a rule for Tomato/);
  });

  it('crosses dimensions when the ingredient has a rule', () => {
    expect(baseValue(3, 'pc', onion)).toBe(450); // { pc: 150 } grams per onion
    expect(baseValue(500, 'ml', oil)).toBe(460); // { ml: 0.92 } grams per ml
  });

  it('lets a rule for ml cover L, and a rule for pc cover dozen', () => {
    expect(baseValue(1, 'L', oil)).toBe(920);
    const eggsByWeight = ingredient('Eggs', { dimension: 'mass', conversions: { pc: 60 } });
    expect(baseValue(1, 'dozen', eggsByWeight)).toBe(720);
  });

  it('refuses a cup when the ingredient has no cup rule', () => {
    const reason = refusal(1, 'cup', rice);
    expect(reason).toMatch(/Rice has no rule for cup/);
    expect(reason).toMatch(/how many grams are in one cup/);
  });

  it('uses the cup rule as grams per cup', () => {
    expect(baseValue(1, 'cup', riceWithCup)).toBe(200);
    expect(baseValue(1.5, 'cups', riceWithCup)).toBe(300);
    expect(baseValue(2, 'Cups', { ...rice, conversions: { Cups: 200 } })).toBe(400); // rule saved under another spelling
  });

  it('refuses pao without a household rule, and uses one when set', () => {
    const reason = refusal(1, 'pao', chicken);
    expect(reason).toMatch(/no rule for pao/);
    expect(reason).toMatch(/differs between households/);
    expect(baseValue(2, 'pao', { ...chicken, conversions: { pao: 250 } })).toBe(500);
  });

  it.each(['tsp', 'tbsp', 'packet', 'pack', 'bunch', 'inch', 'sprig', 'clove'])(
    'refuses %s without a rule rather than guessing',
    unit => {
      expect(refusal(1, unit, tomato)).toMatch(/Tomato has no rule for/);
    },
  );

  it('uses household rules for count ingredients', () => {
    expect(baseValue(2, 'bunches', coriander)).toBe(2);
    expect(baseValue(3, 'sprigs', curryLeaves)).toBe(3);
  });

  it('refuses unknown units, a missing unit, negative amounts and bad rules', () => {
    expect(refusal(2, 'lbs', chicken)).toBe('Unknown unit "lbs".');
    expect(refusal(2, '', chicken)).toBe('No unit given.');
    expect(refusal(-2, 'kg', chicken)).toMatch(/cannot be negative/);
    expect(refusal(Number.NaN, 'kg', chicken)).toMatch(/not an amount/);
    expect(refusal(1, 'cup', { ...rice, conversions: { cup: 0 } })).toMatch(/must be a positive number/);
  });
});

describe('fromBase', () => {
  it.each([
    [1500, chicken, { amount: 1.5, unit: 'kg' }],
    [750, chicken, { amount: 750, unit: 'g' }],
    [1000, chicken, { amount: 1, unit: 'kg' }],
    [1234, chicken, { amount: 1.23, unit: 'kg' }],
    [999.999, chicken, { amount: 1, unit: 'kg' }],
    [0, chicken, { amount: 0, unit: 'g' }],
    [2500, milk, { amount: 2.5, unit: 'L' }],
    [330, milk, { amount: 330, unit: 'ml' }],
    [3, eggs, { amount: 3, unit: 'pc' }],
    [24, eggs, { amount: 24, unit: 'pc' }],
  ])('shows %s base units of %s as a friendly amount', (value, item, expected) => {
    expect(fromBase(value, item)).toEqual(expected);
  });

  it('rounds to two decimals without float noise', () => {
    expect(fromBase(0.1 + 0.2, chicken)).toEqual({ amount: 0.3, unit: 'g' });
    expect(fromBase(12.3456, chicken)).toEqual({ amount: 12.35, unit: 'g' });
    expect(fromBase(1 / 3, eggs)).toEqual({ amount: 0.33, unit: 'pc' });
  });

  it('keeps the sign of a shortfall and never shows -0', () => {
    expect(fromBase(-1500, chicken)).toEqual({ amount: -1.5, unit: 'kg' });
    expect(Object.is(fromBase(-0.001, chicken).amount, 0)).toBe(true);
  });

  it('uses a household display unit when it has a rule and comes out in quarters', () => {
    expect(fromBase(2, coriander)).toEqual({ amount: 2, unit: 'bunch' });
    expect(fromBase(800, biscuits)).toEqual({ amount: 2, unit: 'packet' });
    expect(fromBase(600, biscuits)).toEqual({ amount: 1.5, unit: 'packet' });
    expect(fromBase(130, biscuits)).toEqual({ amount: 130, unit: 'g' }); // 0.325 packet is not friendly
  });

  it('falls back to metric when the household display unit has no rule', () => {
    const noRule = ingredient('Mint', { dimension: 'mass', displayUnit: 'bunch' });
    expect(fromBase(50, noRule)).toEqual({ amount: 50, unit: 'g' });
  });

  it('round-trips with toBase', () => {
    expect(fromBase(baseValue(1.5, 'kg', chicken), chicken)).toEqual({ amount: 1.5, unit: 'kg' });
    expect(fromBase(baseValue(750, 'ml', milk), milk)).toEqual({ amount: 750, unit: 'ml' });
  });
});

describe('parseQuantityLine', () => {
  it.each([
    ['Chicken — 500 g', 'Chicken', 500, 'g'],
    ['chicken 1.5kg', 'chicken', 1.5, 'kg'],
    ['Eggs x 12', 'Eggs', 12, 'pc'],
    ['Eggs x12', 'Eggs', 12, 'pc'],
    ['Eggs × 12', 'Eggs', 12, 'pc'],
    ['12x eggs', 'eggs', 12, 'pc'],
    ['2 dozen eggs', 'eggs', 2, 'dozen'],
    ['Onions 1 kg', 'Onions', 1, 'kg'],
    ['Tomatoes: 6', 'Tomatoes', 6, 'pc'],
    ['Yoghurt ½ kg', 'Yoghurt', 0.5, 'kg'],
    ['Ghee ¼ kg', 'Ghee', 0.25, 'kg'],
    ['Butter ¾ kg', 'Butter', 0.75, 'kg'],
    ['Rice 1½ kg', 'Rice', 1.5, 'kg'],
    ['Sugar 1/2 kg', 'Sugar', 0.5, 'kg'],
    ['Flour 1 1/2 kg', 'Flour', 1.5, 'kg'],
    ['milk 1,000 ml', 'milk', 1000, 'ml'],
    ['Atta 10,000 g', 'Atta', 10000, 'g'],
    ['Oil .5 L', 'Oil', 0.5, 'L'],
    ['500g chicken', 'chicken', 500, 'g'],
    ['2 kg of rice', 'rice', 2, 'kg'],
    ['Garlic 3 cloves', 'Garlic', 3, 'clove'],
    ['Ginger 2 inch', 'Ginger', 2, 'inch'],
    ['Mint 2 sprigs', 'Mint', 2, 'sprig'],
    ['Coriander 1 bunch', 'Coriander', 1, 'bunch'],
    ['Milk 2 packets', 'Milk', 2, 'packet'],
    ['Daal 1 pao', 'Daal', 1, 'pao'],
    ['Lemons 6 nos', 'Lemons', 6, 'pc'],
    ['Salt 2 tsp', 'Salt', 2, 'tsp'],
    ['Eggs 0', 'Eggs', 0, 'pc'],
  ])('reads "%s" as %s: %s %s', (line, name, amount, unit) => {
    expect(parsed(line)).toEqual({ name, quantity: { amount, unit, basis: 'measured' } });
  });

  it('reads a bare number as pieces only when the line has no unit word', () => {
    expect(parsed('Tomatoes 6').quantity.unit).toBe('pc');
    expect(parsed('Milk packet 2')).toEqual({ name: 'Milk', quantity: { amount: 2, unit: 'packet', basis: 'measured' } });
    expect(parsed('Rice (kg): 5')).toEqual({ name: 'Rice', quantity: { amount: 5, unit: 'kg', basis: 'measured' } });
    expect(parsed('Rice in kg: 5').name).toBe('Rice');
  });

  it('treats a hyphen with a space after it as a separator, not a minus sign', () => {
    expect(parsed('Chicken - 500 g').quantity.amount).toBe(500);
    expect(parsed('Eggs-2').quantity.amount).toBe(2);
    expect(parsed('- 2 eggs')).toEqual({ name: 'eggs', quantity: { amount: 2, unit: 'pc', basis: 'measured' } });
  });

  it('copes with list bullets and numbering from a pasted list', () => {
    expect(parsed('• Potatoes - 2 kg')).toEqual({ name: 'Potatoes', quantity: { amount: 2, unit: 'kg', basis: 'measured' } });
    expect(parsed('1. Chicken 500 g')).toEqual({ name: 'Chicken', quantity: { amount: 500, unit: 'g', basis: 'measured' } });
    expect(parsed('2) Eggs x 6').quantity.amount).toBe(6);
  });

  it.each(['-2', 'Eggs -2', 'Eggs: -2', 'Chicken −500 g', '-1.5 kg rice', 'Sugar -½ kg'])(
    'refuses the negative amount in "%s"',
    line => {
      expect(refused(line)).toMatch(/Amounts cannot be negative/);
    },
  );

  it.each([
    ['coriander - some', 'coriander'],
    ['salt ?', 'salt'],
    ['Salt?', 'Salt'],
    ['Ginger: not sure', 'Ginger'],
    ["Turmeric - don't know", 'Turmeric'],
    ['some mint', 'mint'],
    ['Coriander', 'Coriander'],
  ])('reads "%s" as an unknown amount, never zero', (line, name) => {
    expect(parsed(line)).toEqual({ name, quantity: { amount: null, unit: '', basis: 'unknown' } });
  });

  it('keeps a written unit on an unknown amount', () => {
    expect(parsed('Rice (kg): ?')).toEqual({ name: 'Rice', quantity: { amount: null, unit: 'kg', basis: 'unknown' } });
  });

  it.each([
    ['Chicken about 500 g', 500, 'g'],
    ['~2 kg rice', 2, 'kg'],
    ['Atta lagbhag 5 kg', 5, 'kg'],
    ['Oil 1 L approx.', 1, 'L'],
    ['Eggs 12?', 12, 'pc'],
  ])('reads "%s" as an estimate', (line, amount, unit) => {
    expect(parsed(line).quantity).toEqual({ amount, unit, basis: 'estimate' });
  });

  it('names an unknown unit instead of ignoring it', () => {
    expect(refused('Chicken 500 grms')).toMatch(/Unknown unit "grms"/);
    expect(refused('Flour 2 lbs')).toMatch(/Unknown unit "lbs"/);
    expect(refused('Eggs 12 large')).toMatch(/Unknown unit "large"/);
    expect(refused('500grms chicken')).toMatch(/Unknown unit "grms"/);
  });

  it('refuses a line with more than one amount', () => {
    expect(refused('Rice 1,5 kg')).toMatch(/More than one amount/);
    expect(refused('2-3 onions')).toMatch(/More than one amount/);
    expect(refused('Chicken 500 g, Onions 1 kg')).toMatch(/More than one amount/);
  });

  it('refuses a line with no item name', () => {
    expect(refused('500 g')).toMatch(/No item name/);
    expect(refused('?')).toMatch(/No item name/);
    expect(refused('some')).toMatch(/No item name/);
    expect(refused('   ')).toBe('This line is empty.');
  });

  it('keeps digits glued to a word as part of the name', () => {
    expect(parsed('Vitamin B12 2 pcs')).toEqual({ name: 'Vitamin B12', quantity: { amount: 2, unit: 'pc', basis: 'measured' } });
  });
});

describe('matchIngredient', () => {
  it('matches the name, ignoring case and spacing', () => {
    expect(matchIngredient('chicken', ALL)).toBe(chicken);
    expect(matchIngredient('  CHICKEN ', ALL)).toBe(chicken);
    expect(matchIngredient('Red Lentils', ALL)).toBe(masoorDaal);
  });

  it('matches the id with underscores read as spaces', () => {
    expect(matchIngredient('masoor daal', ALL)).toBe(masoorDaal);
    expect(matchIngredient('Masoor-Daal', ALL)).toBe(masoorDaal);
    expect(matchIngredient('masoordaal', ALL)).toBe(masoorDaal);
    expect(matchIngredient('basmati rice', ALL)).toBe(rice);
  });

  it('matches aliases, including Roman Urdu and Urdu script (F69)', () => {
    expect(matchIngredient('pyaz', ALL)).toBe(onion);
    expect(matchIngredient('پیاز', ALL)).toBe(onion);
    expect(matchIngredient('Hari Mirch', ALL)).toBe(greenChilli);
    expect(matchIngredient('chawal', ALL)).toBe(rice);
  });

  it.each([
    ['tomatoes', tomato],
    ['Onions', onion],
    ['green chillies', greenChilli],
    ['egg', eggs],
    ['curry leaf', curryLeaves],
  ])('tolerates the plural or singular "%s"', (name, expected) => {
    expect(matchIngredient(name, ALL)).toBe(expected);
  });

  it('prefers an exact match over a plural one', () => {
    const date = ingredient('Date', { dimension: 'count' });
    const dates = ingredient('Dates', { dimension: 'mass' });
    expect(matchIngredient('dates', [date, dates])).toBe(dates);
    expect(matchIngredient('date', [dates, date])).toBe(date);
  });

  it('returns null rather than a partial match', () => {
    expect(matchIngredient('chicken boneless', ALL)).toBeNull();
    expect(matchIngredient('tomato paste', ALL)).toBeNull();
    expect(matchIngredient('', ALL)).toBeNull();
    expect(matchIngredient('chick', ALL)).toBeNull();
  });
});

describe('from a pasted line to base units', () => {
  it.each([
    ['2 dozen eggs', eggs, 24],
    ['Onions 3', onion, 450],
    ['Milk 1.5 L', milk, 1500],
    ['chawal 2 cups', riceWithCup, 400],
    ['Coriander 2 bunches', coriander, 2],
  ])('"%s" becomes the right amount', (line, expected, base) => {
    const { name, quantity } = parsed(line);
    const pool = ALL.map(item => (item.id === expected.id ? expected : item));
    const match = matchIngredient(name, pool);
    expect(match).toBe(expected);
    expect(baseValue(quantity.amount!, quantity.unit, match!)).toBe(base);
  });
});
