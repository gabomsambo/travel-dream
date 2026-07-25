/**
 * Shared rules for building Vercel Blob object keys for user-uploaded images.
 *
 * All file storage goes to Vercel Blob — never the local filesystem, which is
 * read-only on Vercel outside `/tmp`. These helpers exist so the destination key
 * is always derived from vetted values (the declared MIME type, an owning record
 * id) rather than from `file.name`, which is fully attacker-controlled.
 */

import { isAllowedBlobUrl } from '@/lib/blob-url';

/**
 * Image types accepted for cover images and attachments, mapped to the single
 * canonical extension used in the blob key. Anything not listed is rejected —
 * the extension is never taken from the uploaded filename.
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);

export const IMAGE_TYPE_REJECTED_MESSAGE =
  'Unsupported image type. Allowed: JPEG, PNG, WEBP, HEIC, HEIF';

/**
 * Canonical extension for an allow-listed image MIME type, or `null` when the
 * type is not one we accept. Callers must treat `null` as a rejected upload
 * rather than falling back to a default extension.
 */
export function extensionForMimeType(mimeType: string | undefined | null): string | null {
  if (!mimeType) return null;
  return EXTENSION_BY_MIME_TYPE[mimeType.trim().toLowerCase()] ?? null;
}

/**
 * Blob key for a collection cover image. The only caller-influenced input is the
 * MIME type, and it is resolved through the allow-list above; `collectionId` is
 * checked against the caller's own collections before the URL is persisted.
 */
export function coverBlobPathname(collectionId: string, mimeType: string, uniqueSuffix: string): string | null {
  const ext = extensionForMimeType(mimeType);
  if (!ext) return null;
  return `collections/${collectionId}/cover-${uniqueSuffix}.${ext}`;
}

/**
 * True when a blob key is safe to hand to the store: relative, no `..` segment,
 * no backslashes or control characters. Blob keys are not filesystem paths, but
 * these keys are built from user-supplied filenames elsewhere in the app, so the
 * upload token route refuses traversal-shaped keys as defence in depth.
 */
export function isSafeBlobPathname(pathname: string): boolean {
  if (!pathname || pathname.length > 1024) return false;
  if (pathname.startsWith('/')) return false;
  if (pathname.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(pathname)) return false;
  return !pathname.split('/').includes('..');
}

/**
 * True when `url` is a cover image this app uploaded for `collectionId`.
 *
 * A cover can also point at an existing place photo (set via PATCH), and those
 * blobs belong to an attachment — deleting one would destroy the place's photo.
 * Only keys under this collection's own cover prefix may be deleted.
 *
 * The host is checked first: `PATCH /api/collections/[id]` accepts any string as
 * `coverImageUrl`, so without it an off-store URL with a cover-shaped path would
 * reach `del()`.
 */
export function isOwnedCoverBlobUrl(
  url: string | null | undefined,
  collectionId: string
): url is string {
  if (!url) return false;
  if (!isAllowedBlobUrl(url)) return false;
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith(`/collections/${collectionId}/cover-`);
  } catch {
    return false;
  }
}
