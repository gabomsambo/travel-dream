import { del, get, put } from '@vercel/blob';

const VERCEL_PRIVATE_BLOB_HOST_SUFFIX = '.private.blob.vercel-storage.com';

export interface TikTokPrivateBlobOptions {
  access: 'private';
  token: string;
}

/**
 * The private store is identified by its token: in `@vercel/blob` 2.x a
 * `storeId` option only matters alongside a Vercel OIDC token, which this app
 * does not use, so the read/write token is the one and only configuration.
 */
export function tikTokPrivateBlobOptions(): TikTokPrivateBlobOptions | null {
  const token = process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;
  return { access: 'private', token };
}

export function isPrivateBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith(VERCEL_PRIVATE_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * The private-store counterpart of `isAllowedBlobUrl()`. Only the TikTok photo
 * import and the private photo resolver accept private-store URLs; every other
 * route stays on the public allow-list in `src/lib/blob-url.ts`.
 */
export function isAllowedPrivateBlobUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return url.hostname.toLowerCase().endsWith(VERCEL_PRIVATE_BLOB_HOST_SUFFIX);
}

function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * True when any `/`-separated segment is `..` (or `.`) before or after one
 * round of percent-decoding, or when a segment hides a separator behind
 * encoding. Applied to the URL as it was received, not only to the parsed
 * pathname: the WHATWG parser silently resolves `..`, `%2e%2e` and the
 * half-encoded forms while parsing, so by the time `pathname` exists the
 * traversal has already been applied and is invisible.
 */
function hasTraversalSegment(path: string): boolean {
  return path.split('/').some((raw) => {
    const decoded = decodedSegment(raw);
    if (raw === '..' || raw === '.' || decoded === '..' || decoded === '.') return true;
    if (raw.includes('\\') || decoded.includes('\\') || decoded.includes('/')) return true;
    return /^(?:\.|%2e){2}$/i.test(raw) || /^(?:\.|%2e){2}$/i.test(decoded);
  });
}

/**
 * The store pathname for a private blob URL, exactly as it appears in the URL.
 *
 * It is handed to `@vercel/blob`'s `get()` as a pathname, which places it in a
 * store URL verbatim, so it must not be percent-decoded first: decoding would
 * turn an encoded `%2e%2e` into a real `..` segment on the way to the store.
 * Paths that carry such a segment in any form are refused outright.
 */
export function privateBlobPathname(value: string): string | null {
  if (!isAllowedPrivateBlobUrl(value)) return null;
  // The received text, minus query and fragment, before the parser resolves it.
  if (hasTraversalSegment(value.split(/[?#]/, 1)[0])) return null;
  let path: string;
  try {
    path = new URL(value).pathname.slice(1);
  } catch {
    return null;
  }
  if (!path || hasTraversalSegment(path)) return null;
  return path;
}

export async function putTikTokPrivateBlob(
  pathname: string,
  body: Buffer,
  contentType: string,
) {
  const options = tikTokPrivateBlobOptions();
  if (!options) throw new Error('TikTok private Blob storage is not configured');
  return put(pathname, body, {
    ...options,
    contentType,
    addRandomSuffix: true,
  });
}

export async function getTikTokPrivateBlob(
  value: string,
  ifNoneMatch?: string | null,
  abortSignal?: AbortSignal,
) {
  const pathname = privateBlobPathname(value);
  const options = tikTokPrivateBlobOptions();
  if (!pathname || !options) return null;
  return get(pathname, {
    ...options,
    ifNoneMatch: ifNoneMatch ?? undefined,
    ...(abortSignal ? { abortSignal } : {}),
  });
}

export async function deleteTikTokPrivateBlob(value: string): Promise<void> {
  const pathname = privateBlobPathname(value);
  const options = tikTokPrivateBlobOptions();
  if (!pathname || !options) throw new Error('TikTok private Blob storage is not configured');
  await del(value, options);
}

/**
 * Removes a blob this app just uploaded, whatever access the store gave it.
 * A misconfigured store can answer a private upload with a public URL, and
 * that upload must not be left behind in a bucket the user never sees.
 */
export async function deleteTikTokBlob(value: string): Promise<void> {
  const options = tikTokPrivateBlobOptions();
  if (!options) {
    await del(value);
    return;
  }
  await del(value, options);
}
