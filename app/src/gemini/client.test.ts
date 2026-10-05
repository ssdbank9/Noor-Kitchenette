import { describe, expect, it } from 'vitest';
import { createGeminiClient, type GenerateRequest } from './client';
import { GeminiError } from './errors';
import { boundedNumber, cleanText, safeHttpUrl, urlWasFound, youtubeSearchUrl } from './sanitize';

const KEY = 'AIza-test-secret-key-123';
const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const answer = (text: string, extra: object = {}) => ok({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', ...extra }] });

function setup(responses: (Response | Error)[], options: { key?: string | undefined; maxPerMinute?: number; maxRequestBytes?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const waits: number[] = [];
  const client = createGeminiClient({
    getKey: () => ('key' in options ? options.key : KEY),
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      const next = queue.shift()!;
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
    sleep: async ms => { waits.push(ms); },
    maxPerMinute: options.maxPerMinute,
    maxRequestBytes: options.maxRequestBytes,
  });
  return { client, calls, waits };
}
const req: GenerateRequest = { parts: [{ text: 'hello' }] };
const code = async (p: Promise<unknown>) => { try { await p; return 'no error'; } catch (e) { return (e as GeminiError).code ?? String(e); } };

describe('Gemini client', () => {
  it('sends the key in a header, never in the URL, and returns the text', async () => {
    const { client, calls } = setup([answer('Hi')]);
    const r = await client.generate(req);
    expect(r.text).toBe('Hi');
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(calls[0].url).toContain('generateContent');
  });

  it('asks for JSON with a schema and parses it; bad JSON is a clear error', async () => {
    const good = setup([answer('{"a":1}')]);
    expect((await good.client.generate({ ...req, json: { schema: { type: 'OBJECT' } } })).json).toEqual({ a: 1 });
    const sent = JSON.parse(String(good.calls[0].init.body));
    expect(sent.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' } });
    const bad = setup([answer('not json')]);
    expect(await code(bad.client.generate({ ...req, json: { schema: {} } }))).toBe('bad-response');
  });

  it('turns on Google Search for search calls and returns only pages it found', async () => {
    const { client, calls } = setup([answer('Karahi', {
      groundingMetadata: { webSearchQueries: ['chicken karahi'], groundingChunks: [{ web: { uri: 'https://a.example/karahi', title: 'A' } }, {}] },
    })]);
    const r = await client.generate({ ...req, search: true });
    expect(JSON.parse(String(calls[0].init.body)).tools).toEqual([{ google_search: {} }]);
    expect(r.sources).toEqual([{ uri: 'https://a.example/karahi', title: 'A' }]);
    expect(r.queries).toEqual(['chicken karahi']);
  });

  it('refuses to combine search and JSON in one request', async () => {
    const { client } = setup([]);
    await expect(client.generate({ ...req, search: true, json: { schema: {} } })).rejects.toThrow(/separate calls/);
  });

  it('says what is wrong without leaking the key: no key, bad key, offline, busy, blocked', async () => {
    expect(await code(setup([], { key: undefined }).client.generate(req))).toBe('no-key');
    expect(await code(setup([], { key: '  ' }).client.generate(req))).toBe('no-key');
    const bad = setup([ok({ error: { message: 'API key not valid' } }, 400)]);
    expect(await code(bad.client.generate(req))).toBe('bad-key');
    expect(await code(setup([ok({}, 403)]).client.generate(req))).toBe('bad-key');
    expect(await code(setup([new TypeError('Failed to fetch')]).client.generate(req))).toBe('offline');
    expect(await code(setup([ok({ promptFeedback: { blockReason: 'SAFETY' } })]).client.generate(req))).toBe('blocked');
    const e = await setup([ok({}, 403)]).client.generate(req).catch(x => x as Error);
    expect((e as Error).message).not.toContain(KEY);
  });

  it('times out as a clear, retryable error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const e = await setup([abort]).client.generate(req).catch(x => x as GeminiError);
    expect(e).toMatchObject({ code: 'timeout', retryable: true });
  });

  it('retries once after a busy or server error, honouring Retry-After, then gives up', async () => {
    const recovered = setup([ok({}, 503), answer('fine')]);
    expect((await recovered.client.generate(req)).text).toBe('fine');
    expect(recovered.calls).toHaveLength(2);
    const slow = setup([ok({}, 429, { 'retry-after': '3' }), answer('later')]);
    await slow.client.generate(req);
    expect(slow.waits).toEqual([3000]);
    const stuck = setup([ok({}, 503), ok({}, 503)]);
    expect(await code(stuck.client.generate(req))).toBe('server');
    expect(stuck.calls).toHaveLength(2); // one retry, not a loop
  });

  it('never retries a key problem', async () => {
    const { client, calls } = setup([ok({}, 403), answer('x')]);
    await code(client.generate(req));
    expect(calls).toHaveLength(1);
  });

  it('caps request size and requests per minute', async () => {
    const big = setup([answer('x')], { maxRequestBytes: 100 });
    expect(await code(big.client.generate({ parts: [{ text: 'x'.repeat(500) }] }))).toBe('too-large');
    expect(big.calls).toHaveLength(0);
    const busy = setup([answer('1'), answer('2'), answer('3')], { maxPerMinute: 2 });
    await busy.client.generate(req);
    await busy.client.generate(req);
    expect(await code(busy.client.generate(req))).toBe('rate-limit');
    expect(busy.calls).toHaveLength(2);
  });
});

describe('sanitising model output', () => {
  it('cleans text, caps length, and rejects non-text', () => {
    expect(cleanText('  Chicken\u0000 \n Karahi  ')).toBe('Chicken Karahi');
    expect(cleanText('x'.repeat(500), 10)).toHaveLength(10);
    expect(cleanText(42)).toBe('');
  });

  it('keeps only http(s) links', () => {
    expect(safeHttpUrl('https://foodfusion.com/recipe/x')).toBe('https://foodfusion.com/recipe/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });

  it('bounds numbers and accepts numeric strings', () => {
    expect(boundedNumber('1,5', 0, 10)).toBe(1.5);
    expect(boundedNumber(-1, 0, 10)).toBeNull();
    expect(boundedNumber(Infinity, 0, 10)).toBeNull();
    expect(boundedNumber('abc', 0, 10)).toBeNull();
  });

  it('accepts a link only if the search found that page', () => {
    const found = [{ uri: 'https://www.teaforturmeric.com/chicken-karahi/?utm=x' }];
    expect(urlWasFound('https://teaforturmeric.com/chicken-karahi', found)).toBe(true);
    expect(urlWasFound('https://teaforturmeric.com/invented-page', found)).toBe(false);
    expect(urlWasFound(null, found)).toBe(false);
    const yt = [{ uri: 'https://www.youtube.com/watch?v=SZ_mfgZC75E&utm=x' }];
    expect(urlWasFound('https://youtube.com/watch?v=SZ_mfgZC75E', yt)).toBe(true);
    expect(urlWasFound('https://youtube.com/watch?v=INVENTED123', yt)).toBe(false);
    expect(youtubeSearchUrl('chicken karahi recipe')).toBe('https://www.youtube.com/results?search_query=chicken%20karahi%20recipe');
  });
});
