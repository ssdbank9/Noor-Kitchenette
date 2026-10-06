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

  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength;
  const badEnvelope = (): GeminiError => new GeminiError('bad-response', 'Gemini gave an answer the app could not read. Try again.', true);

  /**
   * One physical request. The timeout stays live until the BODY has been read, so a response
   * whose headers arrive but whose body stalls is still aborted (AR04). A body abort is
   * reported as a timeout, not an opaque error.
   */
  async function once(key: string, body: string): Promise<{ res: Response; data: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: controller.signal,
      });
      let data: unknown;
      try {
        data = await res.json();
      } catch (error) {
        if (controller.signal.aborted || (error as { name?: string }).name === 'AbortError') {
          throw new GeminiError('timeout', 'Gemini took too long. Try again.', true);
        }
        data = undefined; // a non-JSON body is handled by the caller as a bad response
      }
      return { res, data };
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      if (controller.signal.aborted || (e as { name?: string }).name === 'AbortError') {
        throw new GeminiError('timeout', 'Gemini took too long. Try again.', true);
      }
      throw new GeminiError('offline', 'No internet connection. You can still add things by hand.', true);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Uses one slot of the per-minute cap. Every physical attempt, retries included, needs one (AR06). */
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
      if (bytesOf(body) > maxBytes) {
        throw new GeminiError('too-large', 'That photo is too big. Try a smaller one.', false);
      }

      reserveSlot();
      let { res, data } = await once(key, body);
      for (let attempt = 0; attempt < retries && (res.status === 429 || res.status >= 500); attempt++) {
        // A retry is a real request and must use a slot too (AR06).
        reserveSlot();
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1500 + Math.floor(Math.random() * 500);
        await sleep(wait);
        ({ res, data } = await once(key, body));
      }

      const error = isObject(data) && isObject(data.error) ? data.error : undefined;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|API_KEY/i.test(String(error?.message ?? '')))) {
          throw new GeminiError('bad-key', 'Gemini did not accept the key. Check it in Settings.', false);
        }
        if (res.status === 429) throw new GeminiError('rate-limit', 'Gemini is busy or the free limit is used up. Try again later.', true);
        if (res.status >= 500) throw new GeminiError('server', 'Gemini is having trouble. Try again in a moment.', true);
        throw new GeminiError('bad-response', 'Gemini could not use that request.', false);
      }

      // The model's output is untrusted: validate the envelope before reading any field, so a
      // malformed one becomes a controlled error instead of a raw TypeError (AR09).
      if (!isObject(data)) throw badEnvelope();
      const feedback = isObject(data.promptFeedback) ? data.promptFeedback : undefined;
      if (typeof feedback?.blockReason === 'string' && feedback.blockReason) {
        throw new GeminiError('blocked', 'Gemini could not look at that. Try a different photo or name.', false);
      }
      const candidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
      if (candidate !== undefined && !isObject(candidate)) throw badEnvelope();
      const content = candidate && isObject(candidate.content) ? candidate.content : undefined;
      const rawParts = content?.parts;
      if (rawParts !== undefined && !Array.isArray(rawParts)) throw badEnvelope();
      const text = (Array.isArray(rawParts) ? rawParts : [])
        .map(part => (isObject(part) && typeof part.text === 'string' ? part.text : ''))
        .join('').trim();
      const finishReason = candidate ? candidate.finishReason : undefined;
      if (candidate === undefined || (!text && typeof finishReason === 'string' && finishReason !== 'STOP')) {
        throw new GeminiError('blocked', 'Gemini did not give an answer. Try again.', true);
      }

      let json: unknown;
      if (request.json) {
        try { json = JSON.parse(text); } catch {
          throw new GeminiError('bad-response', 'Gemini gave an answer the app could not read. Try again.', true);
        }
      }
      const grounding = candidate && isObject(candidate.groundingMetadata) ? candidate.groundingMetadata : undefined;
      const rawChunks = grounding?.groundingChunks;
      if (rawChunks !== undefined && !Array.isArray(rawChunks)) throw badEnvelope();
      const sources = (Array.isArray(rawChunks) ? rawChunks : [])
        .map(c => {
          const web = isObject(c) && isObject(c.web) ? c.web : undefined;
          return { uri: typeof web?.uri === 'string' ? web.uri : '', title: typeof web?.title === 'string' ? web.title : '' };
        })
        .filter(s => s.uri);
      const queries = Array.isArray(grounding?.webSearchQueries)
        ? (grounding.webSearchQueries as unknown[]).filter((q: unknown): q is string => typeof q === 'string')
        : [];
      return { text, json, sources, queries };
    },
  };
}
