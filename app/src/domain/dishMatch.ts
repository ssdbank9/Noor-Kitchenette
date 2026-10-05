// "Do I already have this dish?" (F80). Noor types a dish the way she says it, and Roman Urdu
// has no fixed spelling: qorma/korma/kurma, karela/karelay/karaley, biryani/biriyani/briyani.
// So words are compared by a rough sound key (vowels dropped, q/k and v/w merged...) rather
// than letter by letter, and a near miss (one letter off) still counts, ranked lower.
// Urdu-script input is not guessed at: it only matches the same characters in a name or alias.
import type { Recipe } from './types';

/** Filler words that never decide which dish is meant. */
const STOP_WORDS = new Set([
  'recipe', 'recipes', 'dish', 'dishes', 'ka', 'ki', 'ke', 'ko', 'with', 'and', 'the', 'a', 'an', 'of',
  'in', 'for', 'how', 'to', 'make', 'banane', 'tarika', 'tareeqa', 'style', 'wala', 'wali', 'easy', 'best',
]);

// Words that sound alike but whose letters differ too much for the sound key.
const SAME_SOUND = new Map<string, string>([
  ['halem', 'hlm'], ['halim', 'hlm'], ['dalem', 'hlm'], ['dalim', 'hlm'],
]);

const NON_LATIN = /[^\u0000-ɏḀ-ỿ -⁯\s\d\p{P}\p{S}]/u;

/** true when the text is Latin letters (and digits, spaces, punctuation). Urdu script and other scripts skip fuzzy matching. */
export function isLatinQuery(text: string): boolean {
  return !NON_LATIN.test(text);
}

function stripMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** The sound-alike spelling of one Latin word: "Daal" and "dhal" both give "dal". */
function soundSpelling(word: string): string {
  let w = word
    .replace(/ph/g, 'f')
    .replace(/ch/g, 'C')
    .replace(/sh/g, 'S')
    .replace(/kh/g, 'x')
    .replace(/gh/g, 'G')
    .replace(/([tdbjrz])h/g, '$1') // aspiration: dhal, bhindi, gobhi
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/c(?=[ei])/g, 's')
    .replace(/c/g, 'k')
    .replace(/(.)\1+/g, '$1') // aa, ee, oo, ll
    .replace(/[vw]$/, '') // pulav, pulao
    .replace(/w/g, 'v');
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // kababs
  return w;
}

const VOWELS = 'aeiouy';

/** Consonant skeleton of a sound spelling: "biriyani" and "briyani" both give "brn". */
function skeleton(sound: string): string {
  const special = SAME_SOUND.get(sound);
  if (special) return special;
  let out = '';
  for (let i = 0; i < sound.length; i++) {
    const ch = sound[i];
    if (VOWELS.includes(ch)) {
      if (i === 0) out += 'a';
      continue;
    }
    if (ch === 'h' && i > 0) {
      const before = sound[i - 1];
      const after = sound[i + 1];
      // h after a consonant, or after a vowel with no vowel following ("dahl"), is silent
      if (!VOWELS.includes(before) || !after || !VOWELS.includes(after)) continue;
    }
    out += ch;
  }
  return out.replace(/(.)\1+/g, '$1');
}

interface Word { sound: string; key: string }

function words(raw: string): Word[] {
  return stripMarks(raw)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w))
    .map(w => {
      const sound = soundSpelling(w);
      return { sound, key: /\d/.test(sound) ? sound : skeleton(sound) };
    });
}

/**
 * A comparable form of a dish name: filler words dropped and each word reduced to its sound,
 * so spelling variants collide ("Chicken Qorma recipe" = "chikan korma"). Urdu-script text
 * is only tidied (case, spacing), never reduced.
 */
export function normalizeDishName(raw: string): string {
  if (!isLatinQuery(raw)) return raw.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return words(raw).map(w => w.key).join(' ');
}

function edits(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** One letter off for words of 4+ letters (two for 8+): "haleem" is near "daleem". */
function nearWord(a: Word, b: Word): boolean {
  const len = Math.min(a.sound.length, b.sound.length);
  if (len < 4) return false;
  return edits(a.sound, b.sound, 2) <= (len >= 8 ? 2 : 1);
}

export type MatchKind = 'exact' | 'alias' | 'near';

export interface HouseholdMatch {
  recipe: Recipe;
  kind: MatchKind;
  /** Higher is better within a kind (share of the name the query covers). */
  score: number;
}

const KIND_ORDER: Record<MatchKind, number> = { exact: 0, alias: 1, near: 2 };

/**
 * Recipes Noor already has that could be the dish she typed, best first: exact (the name has
 * every word, spelling variants included) before alias (an alias has them) before near (a
 * word is one letter off, or the category has it). Nothing is returned for a query made only
 * of filler words.
 */
export function findHouseholdMatches(query: string, recipes: Recipe[]): HouseholdMatch[] {
  if (!query.trim()) return [];
  if (!isLatinQuery(query)) return matchLiterally(query, recipes);
  const q = words(query);
  if (q.length === 0) return [];

  const matches: HouseholdMatch[] = [];
  for (const recipe of recipes) {
    const nameWords = words(recipe.name);
    const aliasLists = (recipe.aliases ?? []).filter(isLatinQuery).map(words);
    const categoryWords = words(recipe.category ?? '');
    const same = (a: Word, b: Word) => a.key === b.key;

    let kind: MatchKind | null = null;
    let score = 0;
    if (q.every(w => nameWords.some(n => same(w, n)))) {
      kind = 'exact';
      score = q.length / Math.max(nameWords.length, q.length);
    } else {
      const alias = aliasLists.find(a => q.every(w => a.some(n => same(w, n)) || nameWords.some(n => same(w, n))));
      if (alias) {
        kind = 'alias';
        score = q.length / Math.max(alias.length, q.length);
      } else {
        const pool = [...nameWords, ...aliasLists.flat()];
        const nearAll = q.every(w => pool.some(n => same(w, n) || nearWord(w, n)) || categoryWords.some(c => same(w, c)));
        if (nearAll) {
          kind = 'near';
          score = q.length / Math.max(nameWords.length, q.length);
        }
      }
    }
    if (kind) matches.push({ recipe, kind, score });
  }
  return matches.sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.score - a.score || a.recipe.name.localeCompare(b.recipe.name),
  );
}

/** Urdu script and other non-Latin input: the same characters in a name or alias, nothing fuzzy. */
function matchLiterally(query: string, recipes: Recipe[]): HouseholdMatch[] {
  const wanted = normalizeDishName(query);
  const out: HouseholdMatch[] = [];
  for (const recipe of recipes) {
    if (normalizeDishName(recipe.name) === wanted) out.push({ recipe, kind: 'exact', score: 1 });
    else if ((recipe.aliases ?? []).some(a => normalizeDishName(a) === wanted)) out.push({ recipe, kind: 'alias', score: 1 });
  }
  return out;
}
