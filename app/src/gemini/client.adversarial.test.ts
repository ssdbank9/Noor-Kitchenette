import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiClient } from './client';
import { GeminiError } from './errors';

afterEach(() => vi.useRealTimers());
const answer = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }));
// A test-only placeholder, never an actual credential.
const getKey = () => 'placeholder';

describe('independent adversarial regressions: Gemini boundaries', () => {
  it('AR04: the timeout covers a response whose headers arrive but whose body stalls', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    let finishBody!: (value: unknown) => void;
    let abortBody!: (error: unknown) => void;
    const body = new Promise((resolve, reject) => { finishBody = resolve; abortBody = reject; });
    const response = { ok: true, status: 200, headers: new Headers(), json: () => body } as Response;
    const client = createGeminiClient({ getKey, timeoutMs: 10,
      fetchImpl: (async (_url, init) => {
        signal = init?.signal;
        signal?.addEventListener('abort', () => abortBody(new DOMException('Body aborted', 'AbortError')));
        return response;
      }) as typeof fetch });
    const result = client.generate({ parts: [{ text: 'hello' }] }).catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    const aborted = signal?.aborted;
    finishBody({ candidates: [{ content: { parts: [{ text: 'late' }] } }] });
    const outcome = await result;
    expect(aborted, 'The request must be aborted even if fetch has already returned headers.').toBe(true);
    expect(outcome).toMatchObject({ code: 'timeout' });
  });

  it('AR05: the request limit counts UTF-8 bytes rather than JavaScript characters', async () => {
    const fetchImpl = vi.fn(async () => answer());
    const text = 'نور'.repeat(100);
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(500);
    const client = createGeminiClient({ getKey, fetchImpl: fetchImpl as typeof fetch, maxRequestBytes: 500 });
    const result = await client.generate({ parts: [{ text }] }).catch(error => error);
    expect(result).toBeInstanceOf(GeminiError);
    expect(result).toMatchObject({ code: 'too-large' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('AR06: automatic retries consume the physical-request rate limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(answer());
    const client = createGeminiClient({ getKey, fetchImpl, maxPerMinute: 1, retries: 1, sleep: async () => {} });
    const result = await client.generate({ parts: [{ text: 'hello' }] }).catch(error => error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ code: 'rate-limit' });
  });

  it.each([
    null,
    { candidates: [{ content: { parts: 'invalid' } }] },
    { candidates: [{ content: { parts: [{ text: 'ok' }] }, groundingMetadata: { groundingChunks: {} } }] },
  ])('AR09: malformed response envelopes produce a controlled error: %j', async response => {
    const client = createGeminiClient({ getKey,
      fetchImpl: (async () => new Response(JSON.stringify(response))) as typeof fetch });
    const result = await client.generate({ parts: [{ text: 'hello' }] }).catch(error => error);
    expect(result).toBeInstanceOf(GeminiError);
    expect(result).toMatchObject({ code: 'bad-response' });
  });
});
