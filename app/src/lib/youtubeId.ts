/** The YouTube video id inside a watch/shorts/embed/youtu.be link, or null when there is none. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const clean = (s: string | null) => (s && /^[\w-]{6,20}$/.test(s) ? s : null);
  if (u.hostname === 'youtu.be') return clean(u.pathname.slice(1));
  const v = u.searchParams.get('v');
  if (v) return clean(v);
  const m = /^\/(?:shorts|embed|live)\/([^/?]+)/.exec(u.pathname);
  return m ? clean(m[1]) : null;
}
