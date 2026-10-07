// Gives any screen the photo-reading client without passing it down by hand, plus a separate
// always-Gemini client for the add-dish lookup (Command Code has no Google-grounded search,
// so a dish search stays on Gemini). Clients are created once and read the CURRENT key from
// settings every call, so saving or removing a key takes effect straight away (K1NB38, D-08).
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createCommandCodeClient, DEFAULT_COMMAND_CODE_MODEL } from '../commandcode/client';
import { createGeminiClient, type GeminiClient } from './client';

type PhotoProvider = 'gemini' | 'commandcode';

interface GeminiValue {
  /** Photo reading: follows Settings' photo provider (Command Code by default). */
  client: GeminiClient;
  /** Add-a-dish internet lookup: always Gemini. */
  dishClient: GeminiClient;
  /** true when the ACTIVE photo provider has a key saved on this phone. */
  hasKey: boolean;
  /** true when a Gemini key is saved (needed for the add-dish lookup). */
  hasGeminiKey: boolean;
  provider: PhotoProvider;
}

const GeminiContext = createContext<GeminiValue | null>(null);

export interface GeminiProviderProps {
  apiKey: string | undefined;
  commandCodeKey: string | undefined;
  photoProvider: PhotoProvider | undefined;
  commandCodeModel: string | undefined;
  children: ReactNode;
}

export function GeminiProvider(p: GeminiProviderProps) {
  const provider = p.photoProvider ?? (p.commandCodeKey?.trim() ? 'commandcode' : 'gemini');
  const geminiKeyRef = useRef(p.apiKey); geminiKeyRef.current = p.apiKey;
  const ccKeyRef = useRef(p.commandCodeKey); ccKeyRef.current = p.commandCodeKey;
  const ccModelRef = useRef(p.commandCodeModel); ccModelRef.current = p.commandCodeModel;

  const client = useMemo(
    () => provider === 'commandcode'
      ? createCommandCodeClient({ getKey: () => ccKeyRef.current, model: ccModelRef.current?.trim() || DEFAULT_COMMAND_CODE_MODEL })
      : createGeminiClient({ getKey: () => geminiKeyRef.current }),
    [provider, p.commandCodeModel],
  );
  const dishClient = useMemo(() => createGeminiClient({ getKey: () => geminiKeyRef.current }), []);

  const value = useMemo<GeminiValue>(() => ({
    client,
    dishClient,
    hasKey: provider === 'commandcode' ? Boolean(p.commandCodeKey?.trim()) : Boolean(p.apiKey?.trim()),
    hasGeminiKey: Boolean(p.apiKey?.trim()),
    provider,
  }), [client, dishClient, provider, p.apiKey, p.commandCodeKey, p.commandCodeModel]);

  return <GeminiContext.Provider value={value}>{p.children}</GeminiContext.Provider>;
}

export function useGemini(): GeminiValue {
  const v = useContext(GeminiContext);
  if (!v) throw new Error('useGemini must be used inside <GeminiProvider>.');
  return v;
}
