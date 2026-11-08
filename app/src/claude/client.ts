// Claude (Anthropic) provider for the photo reading. It implements the SAME GeminiClient
// interface the photo flow already uses, so Snap pantry can change providers without touching
// the review or save flow. Limits mirror the Gemini and Command Code clients: request size cap,
// per-minute cap, a timeout that stays live until the body is read, byte counting, one retry for
// busy/server errors, and the same GeminiError codes.
//
// Anthropic has no Google-grounded search, so `search` is refused and the add-dish lookup stays
// on Gemini. Anthropic also has no JSON response mode, so JSON is requested in words and the
// answer is parsed after stripping code fences.
import { GeminiError } from '../gemini/errors';
import type { GeminiClient } from '../gemini/client';

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
/** JSON mode must also be told in words. */
const JSON_ONLY = 'Respond with a JSON object only. No other words, no code fences.';

export interface ClaudeOptions {
  getKey: () => string | undefined;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Largest request body in bytes (photos are shrunk before this; default 4 MB). */
  maxRequestBytes?: number;
  /** Most requests per minute from this phone (default 12). */
  maxPerMinute?: number;
  /** Extra tries after a busy or server error (default 1). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function createClaudeClient(options: ClaudeOptions): GeminiClient {
  const model = options.model ?? DEFAULT_CLAUDE_MODEL;
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxBytes = options.maxRequestBytes ?? 4_000_000;
  const maxPerMinute = options.maxPerMinute ?? 12;
  const retries = options.retries ?? 1;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const recent: number[] = [];

  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength;
  const badEnvelope = (): GeminiError => new GeminiError('bad-response', 'The scanner gave an answer the app could not read. Try again.', true);

  async function once(key: string, body: string): Promise<{ res: Response; data: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          // Anthropic only answers browser calls when this header is present.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body,
        signal: controller.signal,
      });
      let data: unknown;
      try {
        data = await res.json();
      } catch (error) {
        if (controller.signal.aborted || (error as { name?: string }).name === 'AbortError') {
          throw new GeminiError('timeout', 'The scanner took too long. Try again.', true);
        }
        data = undefined; // a non-JSON body is handled by the caller as a bad response
      }
      return { res, data };
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      if (controller.signal.aborted || (e as { name?: string }).name === 'AbortError') {
        throw new GeminiError('timeout', 'The scanner took too long. Try again.', true);
      }
      throw new GeminiError('offline', 'No internet connection. You can still add things by hand.', true);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Uses one slot of the per-minute cap. Every physical attempt, retries included, needs one. */
  function reserveSlot(): void {
    const t = now();
    while (recent.length && t - recent[0] > 60_000) recent.shift();
    if (recent.length >= maxPerMinute) {
      throw new GeminiError('rate-limit', 'Too many requests. Wait a minute and try again.', true);
    }
    recent.push(t);
  }

  return {
    async generate(request) {
      const key = options.getKey()?.trim();
      if (!key) throw new GeminiError('no-key', 'Add your Claude key in Settings first.', false);
      if (request.search) {
        throw new GeminiError('bad-response', 'Claude cannot look up the internet. Set the photo provider to Gemini in Settings for a dish search.', false);
      }

      const content: Record<string, unknown>[] = [];
      for (const part of request.parts) {
        if ('text' in part) content.push({ type: 'text', text: part.text });
        else content.push({ type: 'image', source: { type: 'base64', media_type: part.inlineData.mimeType, data: part.inlineData.data } });
      }
      if (request.json) content.push({ type: 'text', text: JSON_ONLY });

      const body = JSON.stringify({
        model,
        // Anthropic requires max_tokens. The photo answer is small; leave room for the note.
        max_tokens: request.maxOutputTokens ?? 2000,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: 'user', content }],
        temperature: request.temperature ?? 0.2,
      });
      if (bytesOf(body) > maxBytes) throw new GeminiError('too-large', 'That photo is too big. Try a smaller one.', false);

      reserveSlot();
      let { res, data } = await once(key, body);
      for (let attempt = 0; attempt < retries && (res.status === 429 || res.status >= 500); attempt++) {
        reserveSlot();
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1500 + Math.floor(Math.random() * 500);
        await sleep(wait);
        ({ res, data } = await once(key, body));
      }

      const error = isObject(data) && isObject(data.error) ? data.error : undefined;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new GeminiError('bad-key', 'Claude did not accept the key. Check it in Settings.', false);
        if (res.status === 429) throw new GeminiError('rate-limit', 'Too many requests. Wait a minute and try again.', true);
        if (res.status >= 500) throw new GeminiError('server', 'The scanner is having trouble. Try again in a moment.', true);
        throw new GeminiError('bad-response', `Claude could not use that request${error?.message ? `. ${String(error.message)}` : ''}`, false);
      }

      // The model's output is untrusted: validate the envelope before reading fields.
      if (!isObject(data)) throw badEnvelope();
      const blocks = Array.isArray(data.content) ? data.content : undefined;
      if (blocks === undefined) throw badEnvelope();
      const text = blocks
        .filter(isObject)
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => String(b.text))
        .join('')
        .trim();
      if (!text && data.stop_reason !== 'end_turn' && data.stop_reason !== 'max_tokens') throw badEnvelope();

      let json: unknown;
      if (request.json) {
        try { json = JSON.parse(stripFences(text)); } catch {
          throw new GeminiError('bad-response', 'The scanner did not give readable JSON. Try again.', true);
        }
      }
      return { text, json, sources: [], queries: [], via: `Claude · ${model}` };
    },
  };
}

/** Some models wrap JSON in ``` fences; strip them before parsing. */
function stripFences(text: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(text.trim());
  return m ? m[1].trim() : text.trim();
}
