/**
 * Host allowlist for user-supplied blob URLs.
 *
 * Several routes accept a `blobUrl` from the client, then fetch it server-side
 * (and store it as `sources.uri`, which the privileged cron fetches again).
 * Without a host allowlist that is a server-side request forgery primitive, so
 * every such URL must be pinned to the Vercel Blob store before it is fetched
 * or persisted. Mirrors the allowlist pattern used for external photo sources
 * in `src/app/api/places/[id]/attachments/from-source/route.ts`.
 */

const VERCEL_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

/**
 * Optional comma-separated override for the configured store host, e.g.
 * `BLOB_ALLOWED_HOSTS=my-store.public.blob.vercel-storage.com`.
 * Read per call so tests and previews can vary it.
 */
function configuredBlobHosts(): Set<string> {
  return new Set(
    (process.env.BLOB_ALLOWED_HOSTS || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedBlobUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  const host = parsed.host.toLowerCase();
  if (host.endsWith(VERCEL_BLOB_HOST_SUFFIX)) return true;

  return configuredBlobHosts().has(host);
}

export const BLOB_URL_REJECTED_MESSAGE =
  'blobUrl host not allowed — must be a Vercel Blob URL';
