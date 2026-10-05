// What can go wrong when asking Gemini, in words Noor can act on. `retryable` says whether
// the same request may work if she taps Try again; the app always keeps manual entry open.
export type GeminiErrorCode =
  | 'no-key' | 'bad-key' | 'offline' | 'timeout' | 'rate-limit'
  | 'blocked' | 'bad-response' | 'server' | 'too-large';

export class GeminiError extends Error {
  constructor(
    readonly code: GeminiErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function isGeminiError(e: unknown): e is GeminiError {
  return e instanceof GeminiError;
}

/** A message safe to show Noor for any thrown value. */
export function plainMessage(e: unknown): string {
  return isGeminiError(e) ? e.message : 'Something went wrong. You can still add things by hand.';
}
