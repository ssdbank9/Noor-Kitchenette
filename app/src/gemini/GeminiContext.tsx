// Gives any screen the Gemini client without passing it down by hand. The client is created
// once (so its per-minute limit holds across screens) and always reads the CURRENT key from
// settings, so saving or removing the key takes effect straight away.
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createGeminiClient, type GeminiClient } from './client';

interface GeminiValue {
  client: GeminiClient;
  /** true when a key has been saved on this phone. */
  hasKey: boolean;
}

const GeminiContext = createContext<GeminiValue | null>(null);

export function GeminiProvider({ apiKey, children }: { apiKey: string | undefined; children: ReactNode }) {
  const keyRef = useRef(apiKey);
  keyRef.current = apiKey;
  const client = useMemo(() => createGeminiClient({ getKey: () => keyRef.current }), []);
  const value = useMemo(() => ({ client, hasKey: Boolean(apiKey?.trim()) }), [client, apiKey]);
  return <GeminiContext.Provider value={value}>{children}</GeminiContext.Provider>;
}

export function useGemini(): GeminiValue {
  const v = useContext(GeminiContext);
  if (!v) throw new Error('useGemini must be used inside <GeminiProvider>.');
  return v;
}
