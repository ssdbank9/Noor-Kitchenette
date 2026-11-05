import { describe, expect, it } from 'vitest';
import type { GeminiClient } from './client';
import { suggestMatches, validateGuesses } from './suggest';

const clientReturning = (json: unknown): GeminiClient => ({
  generate: async () => ({ text: JSON.stringify(json), json, sources: [], queries: [] }),
});

describe('suggestMatches', () => {
  it('returns guesses for the asked labels only, cleaned and capped at three', async () => {
    const client = clientReturning({
      guesses: [
        { label: 'floral bottle', matches: ['Rose water', 'Kewra', 'Vinegar', 'A fourth one'] },
        { label: 'never asked about this', matches: ['Sugar'] },
        { label: 'orange juice', matches: [] },
      ],
    });
    const out = await suggestMatches(client, ['floral bottle', 'orange juice'], ['Sugar']);
    expect(out).toEqual({ 'floral bottle': ['Rose water', 'Kewra', 'Vinegar'] });
  });
  it('dedupes labels and asks nothing when the list is empty', async () => {
    let calls = 0;
    const client: GeminiClient = { generate: async () => { calls++; return { text: '{}', json: {}, sources: [], queries: [] }; } };
    expect(await suggestMatches(client, [], ['Sugar'])).toEqual({});
    expect(await suggestMatches(client, ['Rice', 'rice ', 'Rice'], ['Sugar'])).toEqual({});
    expect(calls).toBe(1); // the three spellings collapse to one label; empty list never calls
  });
});

describe('validateGuesses', () => {
  const wanted = ['floral bottle'];
  it('survives junk', () => {
    for (const raw of [undefined, null, 'x', 5, [], { guesses: 'no' }]) {
      expect(validateGuesses(raw, wanted)).toEqual({});
    }
  });
  it('drops blank names and overlong junk', () => {
    const out = validateGuesses({ guesses: [{ label: 'floral bottle', matches: ['', '  ', 'x'.repeat(200), 'Rose water'] }] }, wanted);
    expect(out['floral bottle']).toEqual(['x'.repeat(40), 'Rose water']); // cleanText trims to 40 chars
  });
  it('matches the asked label case-insensitively and answers with the original casing', () => {
    const out = validateGuesses({ guesses: [{ label: 'FLORAL BOTTLE', matches: ['Rose water'] }] }, wanted);
    expect(out).toEqual({ 'floral bottle': ['Rose water'] });
  });
});
