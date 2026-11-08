import { describe, expect, it } from 'vitest';
import type { GeminiClient } from './client';
import { GeminiError } from './errors';
import { chainSearch, type SearchStep } from './searchChain';

// The chain is what makes the search fool-proof: engines are tried in order, the answer
// says which one worked, and every outcome leaves a diagnosis behind.

const page = { uri: 'https://example.pk/haleem', title: 'Haleem' };

function okClient(pages: number): GeminiClient {
  return { generate: async () => ({ text: 'found', sources: Array.from({ length: pages }, () => page), queries: [] }) };
}
function emptyClient(): GeminiClient {
  return { generate: async () => ({ text: 'no pages', sources: [], queries: [] }) };
}
function throwingClient(error: unknown): GeminiClient {
  return { generate: async () => { throw error; } };
}
const steps = (...list: { client: GeminiClient; via: string }[]): SearchStep[] =>
  list.map(s => ({ ...s }));
const code = async (p: Promise<unknown>) => { try { await p; return 'no error'; } catch (e) { return (e as GeminiError).code ?? String(e); } };

const searchRequest = { search: true as const, parts: [{ text: 'haleem' }] };

describe('search chain', () => {
  it('uses the first engine that finds pages, labels it, and records the win', async () => {
    const seen: string[] = [];
    const record: string[] = [];
    const chained = chainSearch({
      steps: steps(
        { client: { generate: async r => { seen.push('a'); return okClient(2).generate(r); } }, via: 'A' },
        { client: throwingClient(new Error('never')), via: 'B' },
      ),
      record: e => record.push(JSON.stringify(e)),
    });
    const r = await chained.generate(searchRequest);
    expect(r.via).toBe('A');
    expect(r.sources).toHaveLength(2);
    expect(seen).toEqual(['a']);
    expect(record[0]).toContain('"ok":true');
    expect(record[0]).toContain('"pages":2');
  });
  it('moves to the second engine when the first answers with no pages', async () => {
    const record: unknown[] = [];
    const chained = chainSearch({
      steps: steps(
        { client: emptyClient(), via: 'A' },
        { client: okClient(1), via: 'B' },
      ),
      record: e => record.push(e),
    });
    const r = await chained.generate(searchRequest);
    expect(r.via).toBe('B');
    expect(record).toEqual([{ via: 'B', ok: true, pages: 1 }]);
  });
  it('keeps the first engine error when every engine fails', async () => {
    const record: unknown[] = [];
    const chained = chainSearch({
      steps: steps(
        { client: throwingClient(new GeminiError('bad-key', 'Command Code did not accept the key. Check it in Settings.', false)), via: 'A' },
        { client: throwingClient(new GeminiError('rate-limit', 'Gemini is busy.', true)), via: 'B' },
      ),
      record: e => record.push(e),
    });
    expect(await code(chained.generate(searchRequest))).toBe('bad-key');
    expect(record).toEqual([{ via: 'A', ok: false, message: 'Command Code did not accept the key. Check it in Settings.' }]);
  });
  it('prefers the plain cannot-search explanation over a later engine failure', async () => {
    const chained = chainSearch({
      steps: steps(
        { client: emptyClient(), via: 'A' },
        { client: throwingClient(new GeminiError('rate-limit', 'Gemini is busy or the free limit is used up. Try again later.', true)), via: 'B' },
      ),
      record: () => {},
    });
    const message = await chained.generate(searchRequest).catch(e => (e as Error).message);
    expect(message).toContain('This model cannot search the web');
  });
  it('says cannot-search when the only engine answers with no pages', async () => {
    const chained = chainSearch({ steps: steps({ client: emptyClient(), via: 'A' }), record: () => {} });
    expect(await code(chained.generate(searchRequest))).toBe('bad-response');
  });
  it('sends non-search requests to the first engine only, untouched', async () => {
    const seen: string[] = [];
    const chained = chainSearch({
      steps: steps(
        { client: { generate: async r => { seen.push(JSON.stringify(r)); return { text: 'x', sources: [], queries: [] }; } }, via: 'A' },
        { client: throwingClient(new Error('never')), via: 'B' },
      ),
      record: () => {},
    });
    const r = await chained.generate({ parts: [{ text: 'convert' }], json: { schema: {} } });
    expect(r.text).toBe('x');
    expect(seen).toHaveLength(1);
  });
});
