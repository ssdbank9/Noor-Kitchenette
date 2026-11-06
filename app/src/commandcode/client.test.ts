import { describe, expect, it } from 'vitest';
import type { GenerateRequest } from '../gemini/client';
import { GeminiError } from '../gemini/errors';
import { createCommandCodeClient, DEFAULT_COMMAND_CODE_MODEL } from './client';

// The Command Code client mirrors the Gemini client's interface and limits while speaking
// OpenAI chat/completions (K1NB38).

const KEY = 'cc-test-secret-key-12345';
const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const answer = (text: string, extra: object = {}) =>
  ok({ choices: [{ message: { content: text }, finish_reason: 'stop', ...extra }] });

interface Options { key?: string | undefined; maxPerMinute?: number; maxRequestBytes?: number; searchModel?: string }

function setup(responses: (Response | Error)[], options: Options = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const waits: number[] = [];
  const client = createCommandCodeClient({
    getKey: () => ('key' in options ? options.key : KEY),
    searchModel: options.searchModel,
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

describe('Command Code client', () => {
  it('posts to chat/completions with a Bearer token (never in the URL), the default model, and returns text', async () => {
    const { client, calls } = setup([answer('Hi')]);
    const r = await client.generate(req);
    expect(r.text).toBe('Hi');
    expect(calls[0].url).toBe('https://api.commandcode.ai/provider/v1/chat/completions');
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(calls[0].init.body)).model).toBe(DEFAULT_COMMAND_CODE_MODEL);
  });

  it('maps a system prompt, text and a base64 image into OpenAI messages and asks for JSON output', async () => {
    const { client, calls } = setup([answer('```json\n{"items":[]}\n```')]);
    const r = await client.generate({
      parts: [{ text: 'read this' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }],
      system: 'Be careful.',
      json: { schema: {} },
    });
    expect(r.json).toEqual({ items: [] });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be careful.' });
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content[0]).toEqual({ type: 'text', text: 'read this' });
    expect(body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    expect(String(body.messages[1].content[2]?.text)).toMatch(/JSON object/);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('parses plain JSON content too, and fails bad JSON as bad-response', async () => {
    const plain = setup([answer('{"a": 2}')]);
    expect((await plain.client.generate({ ...req, json: { schema: {} } })).json).toEqual({ a: 2 });
    const bad = setup([answer('not json')]);
    expect(await code(bad.client.generate({ ...req, json: { schema: {} } }))).toBe('bad-response');
  });

  it('searches through /responses with the web_search tool and reads its citations as sources', async () => {
    const { client, calls } = setup([ok({
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'Found recipes.',
          annotations: [
            { type: 'url_citation', url: 'https://example.pk/haleem', title: 'Example Haleem' },
            { type: 'url_citation', url: 'https://example.pk/haleem', title: 'Example Haleem again' },
            { type: 'url_citation', url: 'https://youtu.be/abc123', title: 'A video' },
          ],
        }],
      }],
    })]);
    const r = await client.generate({ ...req, search: true, system: 'Be careful.' });
    expect(r.text).toBe('Found recipes.');
    expect(r.sources).toEqual([
      { uri: 'https://example.pk/haleem', title: 'Example Haleem' },
      { uri: 'https://youtu.be/abc123', title: 'A video' },
    ]);
    expect(calls[0].url).toBe('https://api.commandcode.ai/provider/v1/responses');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.instructions).toBe('Be careful.');
    expect(body.input[0].content[0]).toEqual({ type: 'input_text', text: 'hello' });
  });

  it('uses the search model when given, and reports an upstream refusal plainly', async () => {
    const refused = setup([ok({ error: { message: 'web_search not supported by this model' } }, 400)], { searchModel: 'openai/gpt-5' });
    expect(await code(refused.client.generate({ ...req, search: true }))).toBe('bad-response');
    const body = JSON.parse(String(refused.calls[0].init.body));
    expect(body.model).toBe('openai/gpt-5');
    const empty = setup([ok({ output: [] })]);
    expect(await code(empty.client.generate({ ...req, search: true }))).toBe('bad-response');
  });

  it('maps errors like the Gemini client: no key, bad key, rate limit, busy-then-ok', async () => {
    expect(await code(setup([], { key: '' }).client.generate(req))).toBe('no-key');
    expect(await code(setup([ok({ error: { message: 'nope' } }, 401)]).client.generate(req))).toBe('bad-key');
    expect(await code(setup([ok({ error: { message: 'no' } }, 403)]).client.generate(req))).toBe('bad-key');
    const rate = setup([ok({ error: { message: 'x' } }, 429), ok({ error: { message: 'x2' } }, 429)]);
    expect(await code(rate.client.generate(req))).toBe('rate-limit');
    const retried = setup([ok({ error: { message: 'x' } }, 500), answer('Hi')]);
    expect((await retried.client.generate(req)).text).toBe('Hi');
    expect(retried.calls).toHaveLength(2);
    expect(retried.waits.length).toBeGreaterThan(0);
  });

  it('caps the request: a body over the byte limit fails before any call', async () => {
    const { client, calls } = setup([], { maxRequestBytes: 200 });
    expect(await code(client.generate({ parts: [{ text: 'x'.repeat(500) }] }))).toBe('too-large');
    expect(calls).toHaveLength(0);
  });

  it('network failure reads as offline; a non-object or message-less body is a bad envelope', async () => {
    expect(await code(setup([new TypeError('fetch failed')]).client.generate(req))).toBe('offline');
    expect(await code(setup([ok(null)]).client.generate(req))).toBe('bad-response');
    expect(await code(setup([ok([])]).client.generate(req))).toBe('bad-response');
    // A choice with no message at all must not read as a silent success (GLM F2).
    expect(await code(setup([ok({ choices: [{ finish_reason: 'stop' }] })]).client.generate(req))).toBe('bad-response');
  });
});
