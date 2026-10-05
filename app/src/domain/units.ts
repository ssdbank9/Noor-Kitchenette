// Units, conversions and the pasted-line parser (F58, F59, F69; fixes v3 defect D2).
// v3 read a pasted line with parseFloat on the number alone and filed it in the
// ingredient's own unit, so "Chicken — 500 g" became 500 kg and "-2" lost its minus sign.
// Here a quantity keeps the unit it was written in. g/kg, ml/L and dozen/pc convert
// exactly; household units (cup, pao, packet, bunch...) convert only through a rule saved
// on the ingredient and are refused, never guessed, without one. Unknown is not zero.

import type { Dimension, Ingredient, Quantity } from './types';

/** Units that convert without a rule, but only within their own dimension. */
const STANDARD: Record<string, { dimension: Dimension; factor: number }> = {
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  L: { dimension: 'volume', factor: 1000 },
  pc: { dimension: 'count', factor: 1 },
  dozen: { dimension: 'count', factor: 12 },
};

/** Accepted spellings of each unit, singular and lower case; normaliseUnit adds plurals. */
const SPELLINGS: Record<string, string[]> = {
  g: ['g', 'gm', 'gram', 'gramme'],
  kg: ['kg', 'kilo', 'kilogram', 'kilogramme'],
  ml: ['ml', 'millilitre', 'milliliter'],
  L: ['l', 'ltr', 'litre', 'liter'],
  pc: ['pc', 'piece', 'nos', 'unit'],
  dozen: ['dozen', 'doz', 'dz', 'darjan'],
  tsp: ['tsp', 'teaspoon'],
  tbsp: ['tbsp', 'tbs', 'tablespoon'],
  cup: ['cup'],
  packet: ['packet', 'pack', 'pkt'],
  bunch: ['bunch'],
  pao: ['pao', 'pau', 'paao'],
  inch: ['inch'],
  sprig: ['sprig'],
  clove: ['clove'],
};

/** Every unit the app understands, standard units first, e.g. for a unit picker. */
export const KNOWN_UNITS: readonly string[] = Object.keys(SPELLINGS);

const BY_SPELLING = new Map(
  Object.entries(SPELLINGS).flatMap(([unit, spellings]) => spellings.map(s => [s, unit] as const)),
);

const MEASURED_BY: Record<Dimension, string> = { mass: 'weight', volume: 'volume', count: 'count' };
const BASE_WORD: Record<Dimension, string> = { mass: 'grams', volume: 'millilitres', count: 'pieces' };

/** Canonical unit for any accepted spelling: "Kgs" -> 'kg', "litres" -> 'L', "Bunches" -> 'bunch'. */
export function normaliseUnit(raw: string): string | null {
  const key = raw.toLowerCase().replace(/[\s.]+/g, '');
  if (!key) return null;
  return (
    BY_SPELLING.get(key) ??
    (key.endsWith('s') ? BY_SPELLING.get(key.slice(0, -1)) : undefined) ?? // cups, kgs, pcs
    (key.endsWith('ches') ? BY_SPELLING.get(key.slice(0, -2)) : undefined) ?? // inches, bunches
    null
  );
}

export type ToBaseResult = { ok: true; value: number } | { ok: false; reason: string };

/**
 * An amount in the ingredient's base unit (g, ml or pc). Standard units convert within the
 * ingredient's dimension; anything else needs ingredient.conversions, and a rule for ml
 * also covers L (likewise g/kg, pc/dozen). Never crosses mass and volume without a rule.
 */
export function toBase(amount: number, unit: string, ingredient: Ingredient): ToBaseResult {
  if (!Number.isFinite(amount)) return refuse(`"${amount}" is not an amount.`);
  if (amount < 0) return refuse('Amounts cannot be negative.');
  const canonical = normaliseUnit(unit);
  if (!canonical) return refuse(unit.trim() ? `Unknown unit "${unit.trim()}".` : 'No unit given.');

  const standard = STANDARD[canonical];
  if (standard?.dimension === ingredient.dimension) return converted(amount * standard.factor);

  const direct = ruleFor(ingredient, canonical);
  if (direct !== undefined) return applyRule(amount, direct, canonical, ingredient);

  if (standard) {
    for (const [sibling, other] of Object.entries(STANDARD)) {
      if (other.dimension !== standard.dimension || sibling === canonical) continue;
      const rule = ruleFor(ingredient, sibling);
      if (rule !== undefined) return applyRule((amount * standard.factor) / other.factor, rule, sibling, ingredient);
    }
    return refuse(
      `${ingredient.name} is measured by ${MEASURED_BY[ingredient.dimension]}, not ` +
        `${MEASURED_BY[standard.dimension]}, so ${canonical} needs a rule for ${ingredient.name} first.`,
    );
  }

  const base = BASE_WORD[ingredient.dimension];
  if (canonical === 'pao') {
    return refuse(
      `${ingredient.name} has no rule for pao yet. A pao differs between households ` +
        `(250 g is common), so say how many ${base} are in one pao.`,
    );
  }
  return refuse(`${ingredient.name} has no rule for ${canonical} yet. Say how many ${base} are in one ${canonical}.`);
}

/**
 * A friendly display of base units: 1500 g -> 1.5 kg, 750 g -> 750 g, 3 pc -> 3 pc. Uses the
 * ingredient's household display unit (bunch, packet) when it has a rule and the amount
 * comes out in quarters; otherwise g/kg, ml/L or pc. At most two decimals, no float noise.
 */
export function fromBase(value: number, ingredient: Ingredient): { amount: number; unit: string } {
  const preferred = normaliseUnit(ingredient.displayUnit);
  if (preferred && !STANDARD[preferred]) {
    const perUnit = ruleFor(ingredient, preferred);
    if (perUnit !== undefined && isValidRule(perUnit)) {
      const amount = round2(value / perUnit);
      // Count-type ingredients (oil in cups, spices in teaspoons) have no metric unit to fall
      // back to, and "pc" would be meaningless, so they always show in their own unit. Others
      // (mass/volume) prefer a tidy quarter-unit and otherwise show grams or millilitres.
      if (ingredient.dimension === 'count' || Number.isInteger(amount * 4)) return { amount, unit: preferred };
    }
  }
  const rounded = round2(value);
  const large = Math.abs(rounded) >= 1000;
  switch (ingredient.dimension) {
    case 'mass':
      return large ? { amount: round2(value / 1000), unit: 'kg' } : { amount: rounded, unit: 'g' };
    case 'volume':
      return large ? { amount: round2(value / 1000), unit: 'L' } : { amount: rounded, unit: 'ml' };
    case 'count':
      return { amount: rounded, unit: 'pc' };
  }
}

export type ParsedLine = { name: string; quantity: Quantity } | { error: string };

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const F = Object.keys(FRACTIONS).join('');

/**
 * One written amount: 500, 1,000, 1.5, .5, 1/2, 1 1/2, ½, 1½. A minus sign is a sign only
 * when it touches the digits ("-2", "Eggs: -2"); "Chicken - 500 g" and "Eggs-2" use it as
 * a separator. A number glued to a letter ("B12") is part of a name, not an amount.
 */
const AMOUNT_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}.])(?<sign>[-−])?` +
    String.raw`(?<body>\d+\s+\d+/\d+|\d+/\d+|\d+\s?[${F}]|[${F}]|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)` +
    String.raw`(?![\d/])`,
  'gu',
);
const UNICODE_FRACTION_RE = new RegExp(String.raw`^(\d*) ?([${F}])$`, 'u');
const LIST_NUMBER_RE = new RegExp(String.raw`^\s*\d{1,2}[.)]\s+(?=.*[\d${F}])`, 'u'); // "1. Chicken 500 g"
const TIMES_BEFORE_RE = new RegExp(String.raw`(^|[\s:=,])[x×](?=\s*[\d.${F}])`, 'giu'); // "Eggs x 12"
const TIMES_AFTER_RE = new RegExp(String.raw`(?<=[\d${F}])\s*[x×](?![\p{L}\p{N}])`, 'giu'); // "12x eggs"

const wordsRe = (alternatives: string) =>
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${alternatives})(?![\p{L}\p{N}])`, 'giu');
/** "about 2 kg", "~2 kg", "2 kg?" and Roman Urdu "lagbhag" mark Noor's estimate. */
const ESTIMATE_WORDS_RE = wordsRe(
  String.raw`about|approx\.?|approximately|around|roughly|almost|nearly|lagbhag|taqreeban|takriban`,
);
/** "some", "?", "not sure" and friends mean the amount is unknown (never zero). */
const UNKNOWN_WORDS_RE = wordsRe(
  String.raw`some|not sure|unsure|unknown|don['’]?t know|idk|pata nahi|a little|a bit|thora|thoda|kuch`,
);
const SEPARATORS = String.raw`[\s\-–—:=,;|.*•·]`;
const EDGE_SEPARATORS_RE = new RegExp(`^${SEPARATORS}+|${SEPARATORS}+$`, 'gu');

/**
 * Reads one pasted or typed line such as "Chicken — 500 g", "2 dozen eggs", "Yoghurt ½ kg"
 * or "coriander - some". Refuses negative amounts, unknown unit words and lines with more
 * than one amount rather than guessing. A bare number is in pieces only when the line has
 * no unit word ("Tomatoes: 6"); "Milk packet 2" is 2 packets. With no amount the basis is
 * 'unknown', the amount null and the unit '' unless one was written.
 */
export function parseQuantityLine(line: string): ParsedLine {
  const shown = line.trim();
  const text = tidy(line);
  if (!text) return { error: 'This line is empty.' };

  const found = [...text.matchAll(AMOUNT_RE)];
  if (found.length === 0) return parseWithoutAmount(text, shown);
  if (found.length > 1) {
    return { error: `More than one amount in "${shown}". Write one item and one amount per line, with a dot for decimals (1.5).` };
  }

  const match = found[0];
  const sign = match.groups?.sign;
  const body = (match.groups?.body ?? '').trim();
  if (sign) return { error: `Amounts cannot be negative: "${sign}${body}" in "${shown}".` };
  const amount = parseAmount(body);
  if (!Number.isFinite(amount)) return { error: `"${body}" is not an amount.` };

  let estimate = false;
  const unmark = (part: string) => {
    const out = part.replace(ESTIMATE_WORDS_RE, ' ').replace(/[~≈?]/g, ' ');
    if (out !== part) estimate = true;
    return out;
  };
  const start = match.index ?? 0;
  const before = cleanName(unmark(text.slice(0, start)));
  let after = unmark(text.slice(start + match[0].length));

  // The word right after the amount is its unit ("500 g", "1.5kg", "2 dozen eggs"). After a
  // name, or glued to the number, an unrecognised word is an unknown unit and is refused.
  let unit: string | null = null;
  const next = /^(\s*)(\p{L}[\p{L}.]*)/u.exec(after);
  if (next) {
    const [whole, gap, word] = next;
    const known = normaliseUnit(word);
    if (known) {
      unit = known;
      after = after.slice(whole.length);
    } else if (before || !gap) {
      return {
        error: `Unknown unit "${word}" in "${shown}". Use g, kg, ml, L, pc, dozen or a household unit such as cup, tsp, packet or pao.`,
      };
    }
  }

  let name = before ? cleanName(`${before} ${after}`) : cleanName(after).replace(/^of\s+/i, '');
  if (!unit) ({ name, unit } = splitTrailingUnit(name));
  if (!name) return { error: `No item name in "${shown}".` };
  return { name, quantity: { amount, unit: unit ?? 'pc', basis: estimate ? 'estimate' : 'measured' } };
}

/**
 * The ingredient a typed name refers to, by name, id (underscores as spaces) or alias.
 * Case-insensitive and tolerant of simple plurals (tomato/tomatoes, chilli/chillies);
 * an exact match anywhere wins over a plural match. null when nothing matches.
 */
export function matchIngredient(name: string, ingredients: Ingredient[]): Ingredient | null {
  const wanted = nameWords(name);
  if (wanted.length === 0) return null;
  const labels = (ingredient: Ingredient) => [ingredient.name, ingredient.id, ...ingredient.aliases].map(nameWords);
  const exact = (label: string[]) => label.join('') === wanted.join('');
  const plural = (label: string[]) =>
    label.length === wanted.length && label.every((word, i) => sameWordOrPlural(word, wanted[i]));
  return (
    ingredients.find(ingredient => labels(ingredient).some(exact)) ??
    ingredients.find(ingredient => labels(ingredient).some(plural)) ??
    null
  );
}

function refuse(reason: string): ToBaseResult {
  return { ok: false, reason };
}

/** Drops float noise from a product (1.1 * 1000 = 1100.0000000000002) without rounding real precision. */
function converted(value: number): ToBaseResult {
  return { ok: true, value: Number(value.toPrecision(12)) };
}

function applyRule(amount: number, perUnit: number, unit: string, ingredient: Ingredient): ToBaseResult {
  if (!isValidRule(perUnit)) return refuse(`The rule for ${unit} on ${ingredient.name} must be a positive number.`);
  return converted(amount * perUnit);
}

function isValidRule(perUnit: number): boolean {
  return Number.isFinite(perUnit) && perUnit > 0;
}

/** The ingredient's own rule for a canonical unit; the saved key may use any spelling ("Cups"). */
function ruleFor(ingredient: Ingredient, unit: string): number | undefined {
  for (const [key, perUnit] of Object.entries(ingredient.conversions ?? {})) {
    if (normaliseUnit(key) === unit) return perUnit;
  }
  return undefined;
}

/** At most two decimals and no float noise: 0.1 + 0.2 -> 0.3, 1.005 -> 1.01, never -0. */
function round2(n: number): number {
  const hundredths = Math.round(Math.abs(Number((n * 100).toPrecision(12))));
  return (Math.sign(n) * hundredths) / 100 + 0;
}

function tidy(line: string): string {
  return line
    .replace(/[   \t]/g, ' ')
    .replace(/⁄/g, '/')
    .replace(LIST_NUMBER_RE, '')
    .replace(TIMES_BEFORE_RE, '$1 ')
    .replace(TIMES_AFTER_RE, ' ')
    .trim();
}

function parseAmount(body: string): number {
  const text = body.replace(/\s+/g, ' ');
  let m: RegExpExecArray | null;
  if ((m = /^(\d+) (\d+)\/(\d+)$/.exec(text))) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if ((m = /^(\d+)\/(\d+)$/.exec(text))) return Number(m[1]) / Number(m[2]);
  if ((m = UNICODE_FRACTION_RE.exec(text))) return Number(m[1] || 0) + FRACTIONS[m[2]];
  return Number(text.replace(/,/g, ''));
}

function parseWithoutAmount(text: string, shown: string): ParsedLine {
  const rest = text.replace(UNKNOWN_WORDS_RE, ' ').replace(ESTIMATE_WORDS_RE, ' ').replace(/[?~≈]/g, ' ');
  const { name, unit } = splitTrailingUnit(cleanName(rest));
  if (!name) return { error: `No item name in "${shown}".` };
  return { name, quantity: { amount: null, unit: unit ?? '', basis: 'unknown' } };
}

/** "Rice (kg)", "Milk packet", "Rice in kg": a unit written as the last word of a name. */
function splitTrailingUnit(name: string): { name: string; unit: string | null } {
  const m = /^(.*\S)\s+[([]?(\p{L}[\p{L}.]*)[)\]]?$/u.exec(name);
  const unit = m ? normaliseUnit(m[2]) : null;
  if (!m || !unit) return { name, unit: null };
  return { name: cleanName(m[1].replace(/\s+(?:in|per)$/i, '')), unit };
}

function cleanName(text: string): string {
  return text
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_SEPARATORS_RE, '')
    .trim();
}

/** Lower-case words of a name, id or alias: "Masoor_Daal" -> ['masoor', 'daal']. */
function nameWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[_\-–—/]+/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

/** onion/onions, tomato/tomatoes, chilli/chillies, berry/berries, leaf/leaves. */
function sameWordOrPlural(a: string, b: string): boolean {
  if (a === b) return true;
  const [one, many] = a.length < b.length ? [a, b] : [b, a];
  return (
    many === `${one}s` ||
    many === `${one}es` ||
    (one.endsWith('y') && many === `${one.slice(0, -1)}ies`) ||
    (one.endsWith('f') && many === `${one.slice(0, -1)}ves`)
  );
}
