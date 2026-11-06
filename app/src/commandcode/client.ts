// Command Code provider for the photo reading (K1NB38, D-08 key-on-phone). Aly's own LLM
// gateway (https://api.commandcode.ai) speaks OpenAI chat/completions for non-Claude models.
// This implements the SAME GeminiClient interface the photo reading uses, so Snap pantry can
// change providers without touching the review or save flow. It mirrors the Gemini client's
// limits and error taxonomy: a request size cap, a per-minute cap, a timeout that stays live
// until the body is read, byte (not character) counting, one retry for busy/server errors, and
// GeminiError codes the UI already maps.
//
// Search goes to the Responses endpoint with the built-in `web_search` tool, which Command Code
// forwards to the upstream model (it may accept or refuse). The search answer's citations become
// the sources the dish lookup checks links against, exactly like Gemini's Google grounding.
import { GeminiError } from '../gemini/errors';
import type { GeminiClient } from '../gemini/client';

export const DEFAULT_COMMAND_CODE_MODEL = 'Qwen/Qwen3.8-Omni-Flash';
/** A cheap OpenAI model that honours the built-in web_search tool (DeepSeek ignores it). */
export const DEFAULT_COMMAND_CODE_SEARCH_MODEL = 'openai/gpt-6-luna';
const ENDPOINT = 'https://api.commandcode.ai/provider/v1/chat/completions';
const RESPONSES_ENDPOINT = 'https://api.commandcode.ai/provider/v1/responses';
/** JSON mode must also be told in words. */
const JSON_ONLY = 'Respond with a JSON object only. No other words, no code fences.';

export interface CommandCodeOptions {
  getKey: () => string | undefined;
  model?: string;
  /** Model for web search (Responses endpoint). Missing means `model`. */
  searchModel?: string;
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

export function createCommandCodeClient(options: CommandCodeOptions): GeminiClient {
  const model = options.model ?? DEFAULT_COMMAND_CODE_MODEL;
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

  async function once(key: string, url: string, body: string): Promise<{ res: Response; data: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
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
      if (!key) throw new GeminiError('no-key', 'Add your Command Code key in Settings first.', false);

      // Web search: the Responses endpoint takes the built-in tool; the upstream may refuse it,
      // and then the caller sees a plain "could not search" answer (and may fall back to Gemini).
      if (request.search) {
        const words = request.parts.filter(part => 'text' in part).map(part => part.text).join('\n');
        if (!words.trim()) throw new GeminiError('bad-response', 'Search needs words to look for.', false);
        const body = JSON.stringify({
          model: options.searchModel?.trim() || model,
          ...(request.system ? { instructions: request.system } : {}),
          input: [{ role: 'user', content: [{ type: 'input_text', text: words }] }],
          tools: [{ type: 'web_search' }],
        });
        if (bytesOf(body) > maxBytes) throw new GeminiError('too-large', 'That search is too big. Try fewer words.', false);

        reserveSlot();
        let { res, data } = await once(key, RESPONSES_ENDPOINT, body);
        for (let attempt = 0; attempt < retries && (res.status === 429 || res.status >= 500); attempt++) {
          reserveSlot();
          const retryAfter = Number(res.headers.get('retry-after'));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1500 + Math.floor(Math.random() * 500);
          await sleep(wait);
          ({ res, data } = await once(key, RESPONSES_ENDPOINT, body));
        }

        const searchError = isObject(data) && isObject(data.error) ? data.error : undefined;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) throw new GeminiError('bad-key', 'Command Code did not accept the key. Check it in Settings.', false);
          if (res.status === 429) throw new GeminiError('rate-limit', 'Too many requests. Wait a minute and try again.', true);
          if (res.status >= 500) throw new GeminiError('server', 'The scanner is having trouble. Try again in a moment.', true);
          throw new GeminiError('bad-response', `Command Code could not search with that model${searchError?.message ? `. ${String(searchError.message)}` : ''}`, false);
        }
        if (!isObject(data)) throw badEnvelope();
        const output = Array.isArray(data.output) ? data.output : [];
        const texts: string[] = [];
        const sources: { uri: string; title: string }[] = [];
        for (const item of output) {
          if (!isObject(item)) continue;
          const parts = Array.isArray(item.content) ? item.content : [];
          for (const part of parts) {
            if (!isObject(part)) continue;
            if (part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
            const annotations = Array.isArray(part.annotations) ? part.annotations : [];
            for (const a of annotations) {
              if (!isObject(a) || a.type !== 'url_citation') continue;
              const uri = typeof a.url === 'string' ? a.url : '';
              const title = typeof a.title === 'string' ? a.title : uri;
              if (uri && !sources.some(s => s.uri === uri)) sources.push({ uri, title });
            }
          }
        }
        const answer = texts.join('').trim();
        if (!answer && sources.length === 0) throw badEnvelope();
        return { text: answer, sources, queries: [] };
      }

      const content: Record<string, unknown>[] = [];
      for (const part of request.parts) {
        if ('text' in part) content.push({ type: 'text', text: part.text });
        else content.push({ type: 'image_url', image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } });
      }
      if (request.json) content.push({ type: 'text', text: JSON_ONLY });

      const body = JSON.stringify({
        model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content },
        ],
        temperature: request.temperature ?? 0.2,
        ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      });
      if (bytesOf(body) > maxBytes) throw new GeminiError('too-large', 'That photo is too big. Try a smaller one.', false);

      reserveSlot();
      let { res, data } = await once(key, ENDPOINT, body);
      for (let attempt = 0; attempt < retries && (res.status === 429 || res.status >= 500); attempt++) {
        reserveSlot();
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1500 + Math.floor(Math.random() * 500);
        await sleep(wait);
        ({ res, data } = await once(key, ENDPOINT, body));
      }

      const error = isObject(data) && isObject(data.error) ? data.error : undefined;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new GeminiError('bad-key', 'Command Code did not accept the key. Check it in Settings.', false);
        if (res.status === 429) throw new GeminiError('rate-limit', 'Too many requests. Wait a minute and try again.', true);
        if (res.status >= 500) throw new GeminiError('server', 'The scanner is having trouble. Try again in a moment.', true);
        throw new GeminiError('bad-response', `Command Code could not use that request${error?.message ? `. ${String(error.message)}` : ''}`, false);
      }

      // The model's output is untrusted: validate the envelope before reading fields (AR09).
      if (!isObject(data)) throw badEnvelope();
      const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
      if (choice !== undefined && !isObject((choice as Record<string, unknown>).message)) throw badEnvelope();
      const message = choice && isObject(choice.message) ? choice.message : undefined;
      const rawContent = message?.content;
      const text = (typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.filter(isObject).map(c => (typeof c.text === 'string' ? c.text : '')).join('')
          : '').trim();
      const finishReason = choice ? choice.finish_reason : undefined;
      if (choice === undefined || (!text && typeof finishReason === 'string' && finishReason !== 'stop')) throw badEnvelope();

      let json: unknown;
      if (request.json) {
        try { json = JSON.parse(stripFences(text)); } catch {
          throw new GeminiError('bad-response', 'The scanner did not give readable JSON. Try again.', true);
        }
      }
      return { text, json, sources: [], queries: [] };
    },
  };
}

/** Some models wrap JSON in ``` fences; strip them before parsing. */
function stripFences(text: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(text.trim());
  return m ? m[1].trim() : text.trim();
}
