/**
 * Attaching a photo from an external source, and choosing a place's primary
 * photo. Shared by the Find-image dialog's route, the primary-photo route and
 * `scripts/backfill-place-photos.ts`, so a photo attached by any of them is
 * stored and promoted the same way.
 */
import { and, eq, sql } from 'drizzle-orm';
import { attachments, places } from '@/db/schema';
import type { AttributionMeta } from '@/db/schema/attachments';
import { createAttachment } from '@/lib/db-mutations';
import type { PhotoSource } from '@/lib/photo-sources/types';
import { forUser } from '@/lib/tenant-db';

export interface PhotoFromSource {
  source: PhotoSource;
  sourceId: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
  width: number | null;
  height: number | null;
  attribution: AttributionMeta;
  caption?: string;
}

/**
 * - `if-first`: primary only when it is the place's only photo (the dialog's rule).
 * - `always`: primary regardless, replacing whichever photo was primary.
 */
export type PrimaryPolicy = 'if-first' | 'always';

export type Attachment = typeof attachments.$inferSelect;

export type AttachResult =
  | { ok: true; attachment: Attachment; deduped: boolean }
  | { ok: false; status: 400 | 404 | 500; error: string };

// Commons serves originals from upload. and the imageinfo thumbnails from thumb.
const WIKIMEDIA_HOSTS = new Set([
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'commons.wikimedia.org',
]);
const PEXELS_HOSTS = new Set(['images.pexels.com']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Make `attachmentId` the place's only primary photo. Returns false, writing
 * nothing, when the attachment is not on a place `userId` owns.
 */
export async function setPrimaryPhoto(
  userId: string,
  placeId: string,
  attachmentId: string,
): Promise<boolean> {
  const tdb = forUser(userId);

  // Verify the attachment belongs to a place owned by the caller before any
  // write — otherwise this clears `isPrimary` across another user's place.
  const owned = await tdb
    .selectFieldsVia(
      attachments,
      { id: attachments.id },
      and(eq(attachments.id, attachmentId), eq(attachments.placeId, placeId))
    )
    .limit(1);

  if (owned.length === 0) return false;

  // `tx` is scoped to the same caller, so both writes carry the ownership
  // predicate on their own rather than inheriting it from the check above.
  await tdb.transaction(async (tx) => {
    // Clear existing primary for this place
    await tx.updateVia(attachments, { isPrimary: 0 }, eq(attachments.placeId, placeId));

    // Set new primary
    await tx.updateVia(
      attachments,
      { isPrimary: 1 },
      and(eq(attachments.id, attachmentId), eq(attachments.placeId, placeId))
    );
  });

  return true;
}

/**
 * Attach a photo picked from Google Places, Wikimedia or Pexels to a place the
 * user owns. Idempotent per (place, source, sourceId): a repeat returns the
 * existing row with `deduped: true` and does not touch which photo is primary.
 *
 * Google photos are stored as a reference only. `uri` points at the app's
 * resolver, which turns the photo name into a short-lived URL on view, so no
 * Google image bytes or URLs are persisted.
 */
export async function attachPhotoFromSource(
  userId: string,
  placeId: string,
  photo: PhotoFromSource,
  primary: PrimaryPolicy = 'if-first',
): Promise<AttachResult> {
  if (photo.attribution.kind !== photo.source) {
    return { ok: false, status: 400, error: 'Attribution kind does not match source' };
  }

  const tdb = forUser(userId);

  const [place] = await tdb
    .selectFields(places, { id: places.id }, eq(places.id, placeId))
    .limit(1);
  if (!place) {
    return { ok: false, status: 404, error: 'Place not found' };
  }

  // Dedup: same source + sourceId on the same place
  const existing = await tdb
    .selectVia(
      attachments,
      and(
        eq(attachments.placeId, placeId),
        eq(attachments.source, photo.source),
        eq(attachments.sourceId, photo.sourceId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { ok: true, attachment: existing[0], deduped: true };
  }

  // Build URI. attachment.uri must always be a renderable URL.
  const id = `att_${crypto.randomUUID()}`;
  let uri: string;
  let thumbnailUri: string;

  if (photo.source === 'google_places') {
    uri = `/api/photos/resolve/${id}`;
    thumbnailUri = `/api/photos/resolve/${id}?w=400`;
  } else {
    if (!photo.fullUrl) {
      return { ok: false, status: 400, error: 'fullUrl required for non-google sources' };
    }
    const allowed = photo.source === 'wikimedia' ? WIKIMEDIA_HOSTS : PEXELS_HOSTS;
    const fullHost = hostOf(photo.fullUrl);
    if (!fullHost || !allowed.has(fullHost)) {
      return { ok: false, status: 400, error: `fullUrl host not allowed for ${photo.source} source` };
    }
    if (photo.thumbnailUrl) {
      const thumbHost = hostOf(photo.thumbnailUrl);
      if (!thumbHost || !allowed.has(thumbHost)) {
        return {
          ok: false,
          status: 400,
          error: `thumbnailUrl host not allowed for ${photo.source} source`,
        };
      }
    }
    uri = photo.fullUrl;
    thumbnailUri = photo.thumbnailUrl ?? photo.fullUrl;
  }

  const filename =
    `${photo.source}-${photo.sourceId}`.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 100);

  const attachment = await createAttachment(
    {
      id,
      placeId,
      type: 'photo',
      uri,
      filename,
      mimeType: 'image/jpeg',
      width: photo.width ?? undefined,
      height: photo.height ?? undefined,
      thumbnailUri,
      caption: photo.caption,
      isPrimary: 0,
      source: photo.source,
      sourceId: photo.sourceId,
      attribution: photo.attribution,
    },
    userId,
  );

  if (!attachment) {
    return { ok: false, status: 500, error: 'Failed to create attachment' };
  }

  let makePrimary = primary === 'always';
  if (!makePrimary) {
    // First-photo-as-primary: count after insert; if exactly one photo, mark primary.
    const [{ c: photoCount }] = await tdb.selectFieldsVia(
      attachments,
      { c: sql<number>`count(*)` },
      and(eq(attachments.placeId, placeId), eq(attachments.type, 'photo')),
    );
    makePrimary = Number(photoCount) === 1;
  }

  if (makePrimary) {
    await setPrimaryPhoto(userId, placeId, attachment.id);
    return { ok: true, attachment: { ...attachment, isPrimary: 1 }, deduped: false };
  }

  return { ok: true, attachment, deduped: false };
}
