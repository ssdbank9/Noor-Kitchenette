// Shared by the store components. Links open with target="_blank" rel="noopener noreferrer".
// Whether a link opens the store's phone app is UNVERIFIED: it depends on the phone and store.
import { isHttpsUrl } from '../domain/stores';

/** Opens an https link in a new tab, synchronously (call it first inside the tap). False when refused. */
export function openLink(url: string | null | undefined): boolean {
  if (!isHttpsUrl(url)) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** Copies text; false when the phone would not allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
