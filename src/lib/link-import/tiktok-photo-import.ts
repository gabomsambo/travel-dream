/**
 * An import still marked `importing` after this long was cut off before it
 * could record an outcome (a killed request, a deploy), so it may be started
 * again. The route and the Inbox button share this window on purpose: the
 * button must not stay disabled for an import the route would accept.
 */
export const TIKTOK_PHOTO_IMPORT_STALE_MS = 10 * 60 * 1000;

export function isTikTokPhotoImportStale(requestedAt: string | null | undefined, now: number): boolean {
  const startedAt = requestedAt ? Date.parse(requestedAt) : 0;
  return !Number.isFinite(startedAt) || now - startedAt >= TIKTOK_PHOTO_IMPORT_STALE_MS;
}
