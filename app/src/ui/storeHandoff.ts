// Shared by the store components. Links open with target="_blank" rel="noopener noreferrer".
// Whether a link opens the store's phone app is UNVERIFIED: it depends on the phone and store.
import { isHttpsUrl } from '../domain/stores';

/** Opens an https link in a new tab, synchronously (call it first inside the tap). False when refused. */
export function openLink(url: string | null | undefined): boolean {
  if (!isHttpsUrl(url)) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Copies the text AND opens the link from one tap. The clipboard write is STARTED first, while
 * this page still has focus (opening a new tab takes focus away, and a browser may refuse a
 * clipboard write from a page that has lost it); the link is opened in the same synchronous
 * tick so the tap still counts as a user action and is not blocked. Resolves true if the copy
 * worked.
 */
export function copyThenOpen(text: string, url: string | null | undefined): Promise<boolean> {
  let copy: Promise<boolean>;
  try {
    copy = navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch {
    copy = Promise.resolve(false);
  }
  openLink(url);
  return copy;
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
