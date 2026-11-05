import { describe, expect, it } from 'vitest';
import type { GenerateRequest } from '../gemini/client';
import { GeminiError } from '../gemini/errors';
import { createClaudeClient, DEFAULT_CLAUDE_MODEL } from './client';

// The Claude client mirrors the Gemini client's interface and limits while speaking the
// Anthropic Messages API.

const KEY = 'sk-ant-test-key-12345';
const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const answer = (text: string, stop = 'end_turn') => ok({ content: [{ type: 'text', text }], stop_reason: stop });

interface Options { key?: string | undefined; maxPerMinute?: number; maxRequestBytes?: number }

function setup(responses: (Response | Error)[], options: Options = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const waits: number[] = [];
  const client = createClaudeClient({
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

describe('Claude client', () => {
  it('posts to /v1/messages with the key in a header, the API version, and the default model', async () => {
    const { client, calls } = setup([answer('Hi')]);
    const r = await client.generate(req);
    expect(r.text).toBe('Hi');
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].url).not.toContain(KEY);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(String(calls[0].init.body)).model).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('maps a system prompt, text and a base64 image into Anthropic blocks and parses fenced JSON', async () => {
    const { client, calls } = setup([answer('```json\n{"items":[]}\n```')]);
    const r = await client.generate({
      parts: [{ text: 'read this' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }],
      system: 'Be careful.',
      json: { schema: {} },
    });
    expect(r.json).toEqual({ items: [] });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.system).toBe('Be careful.');
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'read this' });
    expect(body.messages[0].content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
    expect(String(body.messages[0].content[2]?.text)).toMatch(/JSON object/);
  });

  it('parses plain JSON content, and fails bad JSON as bad-response', async () => {
    const plain = setup([answer('{"a": 2}')]);
    expect((await plain.client.generate({ ...req, json: { schema: {} } })).json).toEqual({ a: 2 });
    const bad = setup([answer('not json')]);
    expect(await code(bad.client.generate({ ...req, json: { schema: {} } }))).toBe('bad-response');
  });

  it('refuses to search, and says so plainly', async () => {
    const { client } = setup([answer('unused')]);
    expect(await code(client.generate({ ...req, search: true }))).toBe('bad-response');
  });

  it('asks for a key when none is saved', async () => {
    const { client } = setup([answer('unused')], { key: undefined });
    expect(await code(client.generate(req))).toBe('no-key');
  });

  it('maps a rejected key and a busy server, retrying the busy one once', async () => {
    const rejected = setup([ok({ error: { message: 'bad key' } }, 401)]);
    expect(await code(rejected.client.generate(req))).toBe('bad-key');
    const busy = setup([ok({ error: { message: 'busy' } }, 503), answer('Hi')]);
    expect((await busy.client.generate(req)).text).toBe('Hi');
    expect(busy.calls).toHaveLength(2);
    expect(busy.waits).toHaveLength(1);
  });

  it('reports a dropped connection as offline and a huge request as too-large', async () => {
    const dropped = setup([new TypeError('network')]);
    expect(await code(dropped.client.generate(req))).toBe('offline');
    const big = setup([answer('unused')], { maxRequestBytes: 10 });
    expect(await code(big.client.generate({ parts: [{ text: 'x'.repeat(100) }] }))).toBe('too-large');
  });
});
