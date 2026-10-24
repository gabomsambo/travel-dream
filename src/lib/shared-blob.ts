/**
 * Guards blob deletion when another row still references the same URL.
 *
 * Screenshots and place photos often share one Vercel Blob object; deleting
 * the inbox row must not remove bytes still used as a place attachment (and
 * vice versa). Scoped to one tenant via `places.user_id` / `sources.user_id`.
 */

import { del } from '@vercel/blob';
import { and, eq, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attachments, places, sources } from '@/db/schema';

export type BlobReferenceExclusions = {
  /** Sources already removed or about to be removed in the same operation */
  excludeSourceIds?: string[];
  /** Attachment row being deleted */
  excludeAttachmentIds?: string[];
};

export async function isBlobUrlStillReferenced(
  userId: string,
  url: string,
  exclusions: BlobReferenceExclusions = {}
): Promise<boolean> {
  if (!url.startsWith('https://')) {
    return false;
  }

  const { excludeSourceIds = [], excludeAttachmentIds = [] } = exclusions;

  const attachmentPredicates = [
    eq(places.userId, userId),
    or(eq(attachments.uri, url), eq(attachments.thumbnailUri, url)),
  ];
  if (excludeAttachmentIds.length > 0) {
    attachmentPredicates.push(notInArray(attachments.id, excludeAttachmentIds));
  }

  const [attachmentHit] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .innerJoin(places, eq(attachments.placeId, places.id))
    .where(and(...attachmentPredicates))
    .limit(1);

  if (attachmentHit) {
    return true;
  }

  const sourceUriPredicates = [eq(sources.userId, userId), eq(sources.uri, url)];
  if (excludeSourceIds.length > 0) {
    sourceUriPredicates.push(notInArray(sources.id, excludeSourceIds));
  }

  const [sourceUriHit] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(...sourceUriPredicates))
    .limit(1);

  if (sourceUriHit) {
    return true;
  }

  const sourceThumbPredicates = [
    eq(sources.userId, userId),
    sql`json_extract(${sources.meta}, '$.uploadInfo.thumbnailPath') = ${url}`,
  ];
  if (excludeSourceIds.length > 0) {
    sourceThumbPredicates.push(notInArray(sources.id, excludeSourceIds));
  }

  const [sourceThumbHit] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(...sourceThumbPredicates))
    .limit(1);

  return Boolean(sourceThumbHit);
}

/**
 * Best-effort delete of a blob URL when no remaining row in this tenant references it.
 */
export async function releaseBlobIfUnreferenced(
  userId: string,
  url: string | null | undefined,
  exclusions: BlobReferenceExclusions,
  logPrefix: string
): Promise<void> {
  if (!url?.startsWith('https://')) {
    return;
  }
  if (await isBlobUrlStillReferenced(userId, url, exclusions)) {
    return;
  }

  try {
    await del(url);
  } catch (cleanupError) {
    console.warn(`${logPrefix} Failed to delete blob ${url}:`, cleanupError);
  }
}

export async function releaseBlobsIfUnreferenced(
  userId: string,
  urls: string[],
  exclusions: BlobReferenceExclusions,
  logPrefix: string
): Promise<void> {
  const unique = [...new Set(urls.filter((u) => u.startsWith('https://')))];
  for (const url of unique) {
    await releaseBlobIfUnreferenced(userId, url, exclusions, logPrefix);
  }
}

/**
 * True when any tenant still stores this URL. A caller-supplied blob URL is not
 * owned by the caller — a same-tenant check would delete another user's object.
 */
export async function isBlobUrlReferencedByAnyTenant(
  url: string,
  exclusions: BlobReferenceExclusions = {}
): Promise<boolean> {
  if (!url.startsWith('https://')) {
    return false;
  }

  const { excludeSourceIds = [], excludeAttachmentIds = [] } = exclusions;

  const attachmentPredicates = [
    or(eq(attachments.uri, url), eq(attachments.thumbnailUri, url)),
  ];
  if (excludeAttachmentIds.length > 0) {
    attachmentPredicates.push(notInArray(attachments.id, excludeAttachmentIds));
  }

  const [attachmentHit] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(...attachmentPredicates))
    .limit(1);

  if (attachmentHit) {
    return true;
  }

  const sourceUriPredicates = [eq(sources.uri, url)];
  if (excludeSourceIds.length > 0) {
    sourceUriPredicates.push(notInArray(sources.id, excludeSourceIds));
  }

  const [sourceUriHit] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(...sourceUriPredicates))
    .limit(1);

  if (sourceUriHit) {
    return true;
  }

  const sourceThumbPredicates = [
    sql`json_extract(${sources.meta}, '$.uploadInfo.thumbnailPath') = ${url}`,
  ];
  if (excludeSourceIds.length > 0) {
    sourceThumbPredicates.push(notInArray(sources.id, excludeSourceIds));
  }

  const [sourceThumbHit] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(...sourceThumbPredicates))
    .limit(1);

  return Boolean(sourceThumbHit);
}

/**
 * Best-effort delete of a caller-supplied blob URL when no row in any tenant references it.
 */
export async function releaseBlobIfUnreferencedByAnyTenant(
  url: string | null | undefined,
  exclusions: BlobReferenceExclusions,
  logPrefix: string
): Promise<void> {
  if (!url?.startsWith('https://')) {
    return;
  }
  if (await isBlobUrlReferencedByAnyTenant(url, exclusions)) {
    return;
  }

  try {
    await del(url);
  } catch (cleanupError) {
    console.warn(`${logPrefix} Failed to delete blob ${url}:`, cleanupError);
  }
}
