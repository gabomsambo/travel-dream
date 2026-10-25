/**
 * Where a photo URL is sent to be right-sized. Pure, because `Photo` renders in
 * client components. The host list mirrors `images.remotePatterns` in
 * `next.config.js` (a test holds the two together).
 */

export type PhotoRoute =
  /** Resized by the Next image optimizer (Blob, Pexels, Wikimedia, local files). */
  | 'optimized'
  /** `/api/photos/resolve/<id>`: sized with `?w=`, never through the optimizer. */
  | 'resolver'
  /** Anything else is used as is. */
  | 'plain';

const RESOLVER_PATH = '/api/photos/resolve/';
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';
const OPTIMIZED_HOSTS = new Set(['images.pexels.com', 'upload.wikimedia.org', 'thumb.wikimedia.org']);

export function photoRoute(url: string): PhotoRoute {
  if (url.startsWith(RESOLVER_PATH)) return 'resolver';
  // The optimizer fetches Google image bytes into its cache, which AGENTS.md
  // forbids; and it must never be pointed at another API route.
  if (url.startsWith('/api/')) return 'plain';
  if (url.startsWith('/') && !url.startsWith('//')) return 'optimized';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'plain';
  }
  if (parsed.protocol !== 'https:') return 'plain';
  const host = parsed.hostname.toLowerCase();
  return host.endsWith(BLOB_HOST_SUFFIX) || OPTIMIZED_HOSTS.has(host) ? 'optimized' : 'plain';
}

/** The resolver URL at one width; any width already on it is replaced. */
export function resolverSrc(url: string, width: number): string {
  const [path] = url.split('?');
  return `${path}?w=${width}`;
}

export function resolverSrcSet(url: string, widths: readonly number[]): string {
  return widths.map((w) => `${resolverSrc(url, w)} ${w}w`).join(', ');
}

// What a tile shows until its photo arrives, so it is never a grey box. Picked
// per photo (not per place) so a collage of one city is not one flat colour.
const TINTS = [
  'bg-gradient-to-br from-teal-800 to-cyan-950',
  'bg-gradient-to-br from-orange-700 to-rose-900',
  'bg-gradient-to-br from-indigo-800 to-slate-900',
  'bg-gradient-to-br from-emerald-800 to-teal-950',
  'bg-gradient-to-br from-amber-700 to-orange-950',
  'bg-gradient-to-br from-fuchsia-800 to-indigo-950',
] as const;

export function photoTint(url: string): string {
  let h = 0;
  for (const c of url.split('?')[0]) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
