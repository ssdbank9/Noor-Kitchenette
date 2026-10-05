// Gemini's answers (and the web pages and photos behind them) are untrusted. Every field the
// app uses from a model answer goes through these checks first. They never throw: a bad field
// becomes null/empty so the review screen can show it as "not sure" for Noor to fix.

/** Plain text: control characters removed, whitespace tidied, length capped. React escapes it on screen. */
export function cleanText(value: unknown, max = 200): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Only ordinary web links. Anything else (javascript:, data:, file:) becomes null. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A finite number within bounds, else null. Accepts numeric strings like "1.5". */
export function boundedNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** A link counts only if the search actually found that page (host and path), so an invented URL is dropped. */
export function urlWasFound(url: string | null, found: { uri: string }[]): boolean {
  if (!url) return false;
  // Query strings are ignored (tracking tags), except a YouTube video id, which IS the page.
  const strip = (u: string) => {
    const bare = u.replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    const video = /^youtube\.com\/watch/.test(bare) ? /[?&]v=([\w-]{6,})/.exec(u)?.[1] : undefined;
    return video ? `${bare}?v=${video}` : bare;
  };
  const target = strip(url);
  return found.some(f => strip(f.uri) === target);
}

/** A YouTube search link: always valid, used when a video link could not be confirmed. */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanText(query, 120))}`;
}
