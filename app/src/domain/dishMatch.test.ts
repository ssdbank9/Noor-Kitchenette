import { describe, expect, it } from 'vitest';
import { findHouseholdMatches, isLatinQuery, normalizeDishName } from './dishMatch';
import type { Recipe } from './types';

const r = (id: string, name: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, name, serves: 4, time: '30 min', notes: '', ingredients: [], version: 1, ...extra,
});
const recipes: Recipe[] = [
  r('R001', 'Chicken Biryani (Extreme)', { category: 'Rice' }),
  r('R005', 'Chicken Qorma', { category: 'Salan & Meat' }),
  r('R012', 'Chicken Macaroni (Korma-style)', { category: 'Desi-Chinese & Pasta' }),
  r('R018', 'Beef Nihari', { category: 'Salan & Meat' }),
  r('R020', 'Bitter Gourd Karela Fry', { category: 'Sabzi' }),
  r('R021', 'Masoor Daal', { category: 'Daal & Beans' }),
  r('R022', 'Aloo Gobi', { category: 'Sabzi' }),
  r('R023', 'Bhindi Masala', { category: 'Sabzi' }),
  r('R024', 'Seekh Kabab', { category: 'Salan & Meat' }),
  r('R025', 'Mutton Haleem', { category: 'Salan & Meat' }),
  r('R026', 'Matar Pulao', { category: 'Rice' }),
];
const ids = (query: string, list = recipes) => findHouseholdMatches(query, list).map(m => m.recipe.id);

describe('normalizeDishName', () => {
  it('gives spelling variants the same form', () => {
    const groups = [
      ['qorma', 'korma', 'kurma', 'Korma'],
      ['karela', 'karelay', 'karaley', 'karele'],
      ['biryani', 'biriyani', 'briyani', 'Biryani'],
      ['nihari', 'nehari'],
      ['daal', 'dal', 'dhal'],
      ['pulao', 'pulav', 'palau'],
      ['kabab', 'kebab', 'kabob'],
      ['haleem', 'halim', 'daleem'],
      ['aloo', 'alu', 'aalu'],
      ['gobi', 'gobhi'],
      ['bhindi', 'bhendi'],
      ['chicken', 'chikan'],
    ];
    for (const g of groups) {
      const forms = new Set(g.map(normalizeDishName));
      expect([g, [...forms]]).toEqual([g, [normalizeDishName(g[0])]]);
    }
  });

  it('keeps different dishes apart', () => {
    expect(normalizeDishName('korma')).not.toBe(normalizeDishName('karahi'));
    expect(normalizeDishName('nihari')).not.toBe(normalizeDishName('haleem'));
    expect(normalizeDishName('biryani')).not.toBe(normalizeDishName('pulao'));
  });

  it('drops filler words and punctuation, and ignores case and accents', () => {
    expect(normalizeDishName('Chicken Korma Recipe')).toBe(normalizeDishName('chikan qorma'));
    expect(normalizeDishName('Korma ka recipe')).toBe(normalizeDishName('korma'));
    expect(normalizeDishName('daal with rice')).toBe(normalizeDishName('Daal, Rice!'));
    expect(normalizeDishName('Biryänı')).toBe(normalizeDishName('biryani'));
  });

  it('leaves Urdu script as typed (tidied only)', () => {
    expect(normalizeDishName('  قورمہ  ')).toBe('قورمہ');
    expect(isLatinQuery('قورمہ')).toBe(false);
    expect(isLatinQuery('Chicken Qorma 2')).toBe(true);
  });
});

describe('findHouseholdMatches', () => {
  it('finds the household Qorma first when she types korma, kurma or qorma', () => {
    for (const q of ['korma', 'kurma', 'qorma', 'Chicken Korma recipe']) {
      expect(ids(q)[0]).toBe('R005');
    }
    // the Korma-style macaroni is offered too, below the real Qorma
    expect(ids('korma')).toEqual(['R005', 'R012']);
  });

  it.each([
    ['biriyani', 'R001'], ['briyani', 'R001'], ['nehari', 'R018'], ['karelay', 'R020'], ['karaley', 'R020'],
    ['dal', 'R021'], ['dhal', 'R021'], ['alu gobhi', 'R022'], ['aalu', 'R022'], ['bhendi', 'R023'],
    ['kebab', 'R024'], ['kabob', 'R024'], ['halim', 'R025'], ['daleem', 'R025'], ['pulav', 'R026'], ['palau', 'R026'],
  ])('%s finds %s', (query, id) => {
    expect(ids(query)[0]).toBe(id);
  });

  it('matches chikan to every chicken dish and ranks the closer name first', () => {
    expect(ids('chikan korma')[0]).toBe('R005');
    expect(ids('chikan')).toEqual(expect.arrayContaining(['R001', 'R005', 'R012']));
  });

  it('ranks exact before alias before near', () => {
    const list = [
      r('N', 'Zafrani Pilaf Rice'),      // not the same dish: never listed
      r('A', 'Shahi Dish', { aliases: ['Zafrani Pulao'] }),
      r('E', 'Zafrani Pulao'),
    ];
    const found = findHouseholdMatches('zafrani palau', list);
    expect(found.map(m => [m.recipe.id, m.kind])).toEqual([['E', 'exact'], ['A', 'alias']]);
  });

  it('finds a dish by an alias Noor saved', () => {
    const list = [r('U-1', 'Mom\'s Special Curry', { aliases: ['Qorma'] })];
    expect(findHouseholdMatches('korma', list)).toMatchObject([{ kind: 'alias' }]);
  });

  it('counts a word one letter off as near, but not a different dish', () => {
    const list = [r('H', 'Haleem'), r('K', 'Karahi'), r('Q', 'Qorma')];
    expect(findHouseholdMatches('haleen', list)).toMatchObject([{ recipe: { id: 'H' }, kind: 'near' }]);
    expect(ids('korma', list)).toEqual(['Q']);
  });

  it('matches on category last', () => {
    const found = findHouseholdMatches('rice', recipes);
    expect(found.map(m => m.recipe.id).sort()).toEqual(['R001', 'R026']);
    expect(found.every(m => m.kind === 'near' || m.kind === 'exact')).toBe(true);
  });

  it('needs every word of the query', () => {
    expect(ids('chicken pulao')).toEqual([]);
    expect(ids('beef korma')).toEqual([]);
  });

  it('ignores filler words and empty input', () => {
    expect(ids('korma ka recipe')).toEqual(ids('korma'));
    expect(ids('recipe')).toEqual([]);
    expect(ids('   ')).toEqual([]);
    expect(ids('')).toEqual([]);
  });

  it('does not guess at Urdu script, but exact name or alias still match', () => {
    const list = [r('R005', 'Chicken Qorma', { aliases: ['قورمہ'] }), r('R018', 'نہاری')];
    expect(findHouseholdMatches('قورمہ', list)).toMatchObject([{ recipe: { id: 'R005' }, kind: 'alias' }]);
    expect(findHouseholdMatches('نہاری', list)).toMatchObject([{ recipe: { id: 'R018' }, kind: 'exact' }]);
    expect(findHouseholdMatches('قورمے', list)).toEqual([]); // one character off: not fuzzy
    expect(findHouseholdMatches('بریانی', recipes)).toEqual([]);
  });

  it('returns nothing for a dish she does not have', () => {
    expect(ids('sushi')).toEqual([]);
    expect(ids('khichdi')).toEqual([]);
  });
});
