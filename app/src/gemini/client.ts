// The one place the app talks to Google Gemini (D-08: the key is typed once on Noor's phone
// and used straight from it; there is no server). Everything the model returns is an
// untrusted DRAFT: callers validate it (sanitize.ts) and Noor reviews it before anything is
// saved. Gemini never changes pantry amounts by itself.
//
// Limits, so a bug or a double tap cannot run up a bill: a request size cap, a per-minute cap,
// a timeout, and one retry only for busy/server errors. The key goes in a header, never in a
// URL, a log line or an error message.
import { GeminiError } from './errors';

export const DEFAULT_MODEL = 'gemini-3.8-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GenerateRequest {
  parts: GeminiPart[];
  system?: string;
  /** Ask for JSON that matches this schema (Gemini schema dialect: OBJECT, ARRAY, STRING...). */
  json?: { schema: Record<string, unknown> };
  /** Let the model use Google Search. Cannot be combined with `json`: do two calls instead. */
  search?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  text: string;
  /** Parsed JSON when `json` was requested. */
  json?: unknown;
  /** Pages the model actually found while searching. Use these to check any URL it mentions. */
  sources: { uri: string; title: string }[];
  queries: string[];
}

export interface GeminiClient {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export interface ClientOptions {
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

interface ApiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export function createGeminiClient(options: ClientOptions): GeminiClient {
  const model = options.model ?? DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxBytes = options.maxRequestBytes ?? 4_000_000;
  const maxPerMinute = options.maxPerMinute ?? 12;
  const retries = options.retries ?? 1;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const recent: number[] = [];

  async function once(key: string, body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') {
        throw new GeminiError('timeout', 'Gemini took too long. Try again.', true);
      }
      throw new GeminiError('offline', 'No internet connection. You can still add things by hand.', true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async generate(request) {
      const key = options.getKey()?.trim();
      if (!key) throw new GeminiError('no-key', 'Add your Gemini key in Settings first.', false);
      if (request.search && request.json) {
        throw new Error('Gemini: search and JSON output must be separate calls.');
      }

      const body = JSON.stringify({
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: [{ role: 'user', parts: request.parts }],
        ...(request.search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
          ...(request.json ? { responseMimeType: 'application/json', responseSchema: request.json.schema } : {}),
        },
      });
      if (body.length > maxBytes) {
        throw new GeminiError('too-large', 'That photo is too big. Try a smaller one.', false);
      }

      const t = now();
      while (recent.length && t - recent[0] > 60_000) recent.shift();
      if (recent.length >= maxPerMinute) {
        throw new GeminiError('rate-limit', 'Too many requests. Wait a minute and try again.', true);
      }
      recent.push(t);

      let res = await once(key, body);
      for (let attempt = 0; attempt < retries && (res.status === 429 || res.status >= 500); attempt++) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1500 + Math.floor(Math.random() * 500);
        await sleep(wait);
        res = await once(key, body);
      }

      let data: ApiResponse = {};
      try { data = (await res.json()) as ApiResponse; } catch { /* handled below */ }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|API_KEY/i.test(data.error?.message ?? ''))) {
          throw new GeminiError('bad-key', 'Gemini did not accept the key. Check it in Settings.', false);
        }
        if (res.status === 429) throw new GeminiError('rate-limit', 'Gemini is busy or the free limit is used up. Try again later.', true);
        if (res.status >= 500) throw new GeminiError('server', 'Gemini is having trouble. Try again in a moment.', true);
        throw new GeminiError('bad-response', 'Gemini could not use that request.', false);
      }

      if (data.promptFeedback?.blockReason) {
        throw new GeminiError('blocked', 'Gemini could not look at that. Try a different photo or name.', false);
      }
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
      if (!candidate || (!text && candidate.finishReason && candidate.finishReason !== 'STOP')) {
        throw new GeminiError('blocked', 'Gemini did not give an answer. Try again.', true);
      }

      let json: unknown;
      if (request.json) {
        try { json = JSON.parse(text); } catch {
          throw new GeminiError('bad-response', 'Gemini gave an answer the app could not read. Try again.', true);
        }
      }
      const sources = (candidate.groundingMetadata?.groundingChunks ?? [])
        .map(c => ({ uri: c.web?.uri ?? '', title: c.web?.title ?? '' }))
        .filter(s => s.uri);
      return { text, json, sources, queries: candidate.groundingMetadata?.webSearchQueries ?? [] };
    },
  };
}
