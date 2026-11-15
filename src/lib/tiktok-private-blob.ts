import { createHash } from 'crypto';
import { del, get, list, put } from '@vercel/blob';

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

/**
 * Where one user's imported TikTok photos live in the private store. The key
 * is derived from the user id alone, so the import that writes under it and
 * the delete-all sweep that lists it can only ever name that user's objects.
 */
export function tikTokImportPrefix(userId: string): string {
  const userKey = createHash('sha256').update(userId).digest('hex').slice(0, 24);
  return `tiktok-imports/${userKey}/`;
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

export interface TikTokPrivateBlobWriteOptions {
  /**
   * Write to the exact pathname, replacing whatever is already there.
   * A regenerated thumbnail must land on the same key, or every attempt would
   * leave its predecessor behind unreferenced.
   */
  overwrite?: boolean;
}

export async function putTikTokPrivateBlob(
  pathname: string,
  body: Buffer,
  contentType: string,
  options: TikTokPrivateBlobWriteOptions = {},
) {
  const storeOptions = tikTokPrivateBlobOptions();
  if (!storeOptions) throw new Error('TikTok private Blob storage is not configured');
  return put(pathname, body, {
    ...storeOptions,
    contentType,
    addRandomSuffix: !options.overwrite,
    ...(options.overwrite ? { allowOverwrite: true } : {}),
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

/**
 * Whether a private-store object still exists, probed with the store's own
 * token.
 *
 * A private object is unreadable without that token, so an unauthenticated HEAD
 * would report every private photo as missing. `dead` is only ever returned for
 * a store that answered with a definite "not found"; an unconfigured store or
 * any other failure is `unknown`, because a photo must never be judged missing
 * just because it could not be read.
 */
export async function privateBlobPresence(
  value: string,
): Promise<'live' | 'dead' | 'unknown'> {
  if (!tikTokPrivateBlobOptions() || !privateBlobPathname(value)) return 'unknown';

  let blob: Awaited<ReturnType<typeof getTikTokPrivateBlob>>;
  try {
    blob = await getTikTokPrivateBlob(value);
  } catch {
    return 'unknown';
  }
  // `get` answers a definite miss with null.
  if (!blob) return 'dead';
  // The object exists; drop the body instead of downloading it.
  if (blob.statusCode === 200) void blob.stream.cancel().catch(() => undefined);
  return 'live';
}

export async function deleteTikTokPrivateBlob(value: string): Promise<void> {
  const pathname = privateBlobPathname(value);
  const options = tikTokPrivateBlobOptions();
  if (!pathname || !options) throw new Error('TikTok private Blob storage is not configured');
  await del(value, options);
}

export type TikTokPrivateBlobBatchDeleteOutcome =
  | { status: 'deleted'; count: number }
  | { status: 'skipped'; reason: 'not_configured' | 'no_private_urls'; count: number };

/**
 * Deletes private-store objects in a single Blob API request.
 *
 * `del()` sends one `POST /delete` per call, so a per-object loop turns a
 * user's whole private collection into a request each. The private store is
 * optional here, so an unconfigured store is reported as skipped (the caller
 * logs it) instead of failing the cleanup, and URLs that are not private-store
 * objects never reach the SDK.
 */
export async function deleteTikTokPrivateBlobs(
  values: string[],
): Promise<TikTokPrivateBlobBatchDeleteOutcome> {
  const options = tikTokPrivateBlobOptions();
  if (!options) return { status: 'skipped', reason: 'not_configured', count: values.length };
  const urls = values.filter((value) => privateBlobPathname(value) !== null);
  if (urls.length === 0) return { status: 'skipped', reason: 'no_private_urls', count: values.length };
  await del(urls, options);
  return { status: 'deleted', count: urls.length };
}

const SWEEP_PAGE_SIZE = 1000;
const SWEEP_MAX_PAGES = 20;

export type TikTokImportSweepOutcome =
  | { status: 'deleted'; count: number }
  | { status: 'skipped'; reason: 'not_configured' };

/**
 * Deletes every private object under one user's import prefix, whether or not
 * a row still names it.
 *
 * An import uploads its photos before it inserts the rows that reference
 * them, so a request killed in between leaves objects no row points at; the
 * URL lists collected from rows cannot see those. Listing the prefix can. The
 * store is asked only for this user's prefix, and anything it returns outside
 * that prefix is ignored rather than deleted.
 */
export async function deleteTikTokImportsForUser(userId: string): Promise<TikTokImportSweepOutcome> {
  const options = tikTokPrivateBlobOptions();
  if (!options) return { status: 'skipped', reason: 'not_configured' };
  const prefix = tikTokImportPrefix(userId);

  const urls: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
    const result = await list({ prefix, limit: SWEEP_PAGE_SIZE, token: options.token, ...(cursor ? { cursor } : {}) });
    for (const blob of result.blobs) {
      if (privateBlobPathname(blob.url)?.startsWith(prefix)) urls.push(blob.url);
    }
    if (!result.hasMore || !result.cursor) break;
    cursor = result.cursor;
  }

  for (let start = 0; start < urls.length; start += SWEEP_PAGE_SIZE) {
    await del(urls.slice(start, start + SWEEP_PAGE_SIZE), options);
  }
  return { status: 'deleted', count: urls.length };
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
