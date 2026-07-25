/**
 * Server-side cleanup for collection cover blobs.
 *
 * Kept out of `src/lib/image-upload.ts` because that module is imported by the
 * cover picker client component, and `@vercel/blob`'s write API is server-only.
 */

import { del } from '@vercel/blob';
import { isOwnedCoverBlobUrl } from '@/lib/image-upload';

/**
 * Best-effort delete of a cover blob this collection owns.
 *
 * A no-op unless the URL is a blob under this collection's own cover prefix — a
 * cover may instead point at an existing place photo, and that blob backs an
 * attachment that must survive the cover being changed or cleared. Deletion
 * failures are logged and swallowed: the DB row has already been updated, and a
 * stranded blob is preferable to failing the request.
 */
export async function releaseOwnedCoverBlob(
  url: string | null | undefined,
  collectionId: string,
  logPrefix: string
): Promise<void> {
  if (!isOwnedCoverBlobUrl(url, collectionId)) return;

  try {
    await del(url);
  } catch (cleanupError) {
    console.warn(`${logPrefix} Failed to delete cover blob:`, cleanupError);
  }
}
