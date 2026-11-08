// The dish search tries engines in order and says which one answered (item 2 of the
// fool-proof search): your search model first, then a second OpenAI model, then Google
// Gemini. A model that answers with no pages is not a failure by itself — the next engine
// gets a turn — but if every engine comes back empty the first honest error wins, so the
// screen still tells Noor (and Aly) exactly what happened.
import type { GenerateRequest, GenerateResult, GeminiClient } from './client';
import { GeminiError, plainMessage } from './errors';
import { writeLastSearch, type LastSearch } from './lastSearch';

export interface SearchStep {
  client: GeminiClient;
  /** Label shown to Noor, e.g. "Command Code · openai/gpt-6-luna". */
  via: string;
}

export interface ChainOptions {
  steps: SearchStep[];
  /** Where the one-line diagnosis goes. Default: localStorage through writeLastSearch. */
  record?: (entry: Omit<LastSearch, 'at'>) => void;
}

const NO_PAGES = () => new GeminiError('bad-response', 'This model cannot search the web. In Settings, choose a search model that can, for example an OpenAI GPT model.', false);

/** A client that searches the steps in order; non-search requests use the first step only. */
export function chainSearch({ steps, record = writeLastSearch }: ChainOptions): GeminiClient {
  if (steps.length === 0) throw new Error('chainSearch needs at least one step.');
  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      if (!request.search) return steps[0].client.generate(request);
      let firstError: unknown = null;
      let sawEmptyAnswer = false;
      for (const [index, step] of steps.entries()) {
        try {
          const result = await step.client.generate(request);
          if (result.sources.length > 0) {
            record({ via: step.via, ok: true, pages: result.sources.length });
            return { ...result, via: step.via };
          }
          // An answer with no pages means this model cannot search (or found nothing):
          // remember it, and give the next engine a turn.
          if (index === 0) sawEmptyAnswer = true;
        } catch (error) {
          if (index === 0) firstError = error;
        }
      }
      // Every engine failed. Prefer the plain "cannot search" explanation when the first
      // engine answered but had nothing, and the first engine's own error otherwise.
      const thrown = sawEmptyAnswer || !firstError ? NO_PAGES() : firstError;
      record({ via: steps[0].via, ok: false, message: plainMessage(thrown) });
      throw thrown;
    },
  };
}
