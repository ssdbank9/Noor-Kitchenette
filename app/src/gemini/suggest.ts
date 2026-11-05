// Follow-up guesses for Snap pantry lines that matched nothing in Noor's ingredients:
// ONE batched text-only call asks the model what each unmatched label probably is — either
// one of the household's ingredients or a plain name for the thing. Text-only, so it works
// on both photo providers (Command Code has no grounded search). The answer is a draft like
// everything else the model says: it only becomes chips Noor can tap.
import type { GeminiClient } from './client';
import { cleanText } from './sanitize';

const MAX_LABELS = 20;
const MAX_GUESSES = 3;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    guesses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          matches: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['label', 'matches'],
      },
    },
  },
  required: ['guesses'],
};

const SYSTEM = [
  'You help a home cook in Pakistan name things seen in photos of groceries and kitchen shelves.',
  'For each label you are given, name what the thing most likely is:',
  '- prefer names from the household list when one plainly fits,',
  '- otherwise give a short plain name a home cook would use (English or Roman Urdu).',
  'Never invent brand products. At most 3 names per label, best first. Keep the label text exactly as given.',
].join('\n');

/**
 * Guesses for unmatched labels, keyed by the exact label text. Anything the model says that
 * is not a clean short name is dropped; an unusable answer yields an empty map, never a throw.
 */
export async function suggestMatches(client: GeminiClient, labels: string[], known: string[]): Promise<Record<string, string[]>> {
  const wanted = [...new Set(labels.map(l => l.trim()).filter(Boolean))].slice(0, MAX_LABELS);
  if (wanted.length === 0) return {};
  const list = wanted.map(l => `- ${l}`).join('\n');
  const knownList = known.slice(0, 120).join(', ');
  const result = await client.generate({
    system: SYSTEM,
    parts: [{ text: `Labels read from a photo:\n${list}\n\nThe household's ingredients: ${knownList || '(none yet)'}` }],
    json: { schema: SCHEMA as Record<string, unknown> },
    temperature: 0.2,
    maxOutputTokens: 1024,
  });
  return validateGuesses(result.json, wanted);
}

/** Keeps only clean answers for labels that were actually asked about. */
export function validateGuesses(raw: unknown, wanted: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  const guesses = (raw as Record<string, unknown>).guesses;
  if (!Array.isArray(guesses)) return out;
  const asked = new Map(wanted.map(l => [l.toLowerCase(), l]));
  for (const entry of guesses) {
    if (!entry || typeof entry !== 'object') continue;
    const label = cleanText((entry as Record<string, unknown>).label, 80);
    const original = asked.get(label.toLowerCase());
    if (!original) continue; // an answer about a label we never asked about
    const matches = (entry as Record<string, unknown>).matches;
    if (!Array.isArray(matches)) continue;
    const names = [...new Set(matches.map(m => cleanText(m, 40)).filter(Boolean))].slice(0, MAX_GUESSES);
    if (names.length > 0) out[original] = names;
  }
  return out;
}
