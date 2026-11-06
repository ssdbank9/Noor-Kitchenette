// Gives any screen the photo-reading client without passing it down by hand, plus a separate
// search client for the add-dish lookup. Command Code does the searching when its key is saved
// (Responses endpoint + web_search); Google Gemini is the fallback, and the only reader for photos
// when Gemini is chosen. Clients are created once and read the CURRENT key from settings every
// call, so saving or removing a key takes effect straight away (K1NB38, D-08).
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createClaudeClient, DEFAULT_CLAUDE_MODEL } from '../claude/client';
import { createCommandCodeClient, DEFAULT_COMMAND_CODE_MODEL } from '../commandcode/client';
import { createGeminiClient, DEFAULT_MODEL as DEFAULT_GEMINI_MODEL, type GeminiClient } from './client';

type PhotoProvider = 'gemini' | 'commandcode' | 'claude';

interface GeminiValue {
  /** Photo reading: follows Settings' photo provider (Command Code by default). */
  client: GeminiClient;
  /** Add-a-dish internet lookup: always Gemini. */
  dishClient: GeminiClient;
  /** true when the ACTIVE photo provider has a key saved on this phone. */
  hasKey: boolean;
  /** true when a Gemini key is saved (needed for the add-dish lookup). */
  hasGeminiKey: boolean;
  /** true when either key that can search is saved (Command Code first, Gemini fallback). */
  hasSearchKey: boolean;
  provider: PhotoProvider;
  /** 'Command Code', 'Claude' or 'Gemini', for display. */
  providerName: 'Command Code' | 'Claude' | 'Gemini';
  /** The model id the photo provider reads with (shown in Snap pantry). */
  photoModel: string;
}

const GeminiContext = createContext<GeminiValue | null>(null);

export interface GeminiProviderProps {
  apiKey: string | undefined;
  commandCodeKey: string | undefined;
  /** Command Code model for web search; missing means the photo model. */
  commandCodeSearchModel: string | undefined;
  claudeKey: string | undefined;
  photoProvider: PhotoProvider | undefined;
  commandCodeModel: string | undefined;
  claudeModel: string | undefined;
  children: ReactNode;
}

export function GeminiProvider(p: GeminiProviderProps) {
  const provider = p.photoProvider ?? (p.commandCodeKey?.trim() ? 'commandcode' : p.claudeKey?.trim() ? 'claude' : 'gemini');
  const geminiKeyRef = useRef(p.apiKey); geminiKeyRef.current = p.apiKey;
  const ccKeyRef = useRef(p.commandCodeKey); ccKeyRef.current = p.commandCodeKey;
  const ccModelRef = useRef(p.commandCodeModel); ccModelRef.current = p.commandCodeModel;
  const ccSearchModelRef = useRef(p.commandCodeSearchModel); ccSearchModelRef.current = p.commandCodeSearchModel;
  const claudeKeyRef = useRef(p.claudeKey); claudeKeyRef.current = p.claudeKey;
  const claudeModelRef = useRef(p.claudeModel); claudeModelRef.current = p.claudeModel;
  const providerName = provider === 'commandcode' ? 'Command Code' as const : provider === 'claude' ? 'Claude' as const : 'Gemini' as const;
  const photoModel = provider === 'commandcode'
    ? (p.commandCodeModel?.trim() || DEFAULT_COMMAND_CODE_MODEL)
    : provider === 'claude'
      ? (p.claudeModel?.trim() || DEFAULT_CLAUDE_MODEL)
      : DEFAULT_GEMINI_MODEL;

  const client = useMemo(
    () => provider === 'commandcode'
      ? createCommandCodeClient({ getKey: () => ccKeyRef.current, model: ccModelRef.current?.trim() || DEFAULT_COMMAND_CODE_MODEL })
      : provider === 'claude'
        ? createClaudeClient({ getKey: () => claudeKeyRef.current, model: claudeModelRef.current?.trim() || DEFAULT_CLAUDE_MODEL })
        : createGeminiClient({ getKey: () => geminiKeyRef.current }),
    [provider, p.commandCodeModel, p.claudeModel],
  );
  const hasCcKey = Boolean(p.commandCodeKey?.trim());
  const dishClient = useMemo(() => {
    const gemini = createGeminiClient({ getKey: () => geminiKeyRef.current });
    if (!hasCcKey) return gemini;
    const commandCode = createCommandCodeClient({
      getKey: () => ccKeyRef.current,
      model: ccModelRef.current?.trim() || DEFAULT_COMMAND_CODE_MODEL,
      searchModel: ccSearchModelRef.current?.trim() || ccModelRef.current?.trim() || DEFAULT_COMMAND_CODE_MODEL,
    });
    return {
      async generate(request) {
        try {
          const first = await commandCode.generate(request);
          // A model that ignored web_search returns no citations: try Gemini when it has a key.
          if (request.search && first.sources.length === 0 && geminiKeyRef.current?.trim()) {
            try { return await gemini.generate(request); } catch { return first; }
          }
          return first;
        } catch (error) {
          if (geminiKeyRef.current?.trim()) {
            try { return await gemini.generate(request); } catch { /* keep the first error */ }
          }
          throw error;
        }
      },
    };
  }, [hasCcKey]);

  const value = useMemo<GeminiValue>(() => ({
    client,
    dishClient,
    hasKey: provider === 'commandcode'
      ? Boolean(p.commandCodeKey?.trim())
      : provider === 'claude' ? Boolean(p.claudeKey?.trim()) : Boolean(p.apiKey?.trim()),
    hasGeminiKey: Boolean(p.apiKey?.trim()),
    hasSearchKey: Boolean(p.apiKey?.trim() || p.commandCodeKey?.trim()),
    provider,
    providerName,
    photoModel,
  }), [client, dishClient, provider, providerName, photoModel, p.apiKey, p.commandCodeKey, p.commandCodeModel, p.claudeKey, p.claudeModel]);

  return <GeminiContext.Provider value={value}>{p.children}</GeminiContext.Provider>;
}

export function useGemini(): GeminiValue {
  const v = useContext(GeminiContext);
  if (!v) throw new Error('useGemini must be used inside <GeminiProvider>.');
  return v;
}
