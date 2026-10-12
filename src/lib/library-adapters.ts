import type { Place } from '@/types/database';
import type { AttributionMeta } from '@/db/schema/attachments';
import type { LibraryPlace } from './db-queries';
import { attachments, placesToCollections } from '@/db/schema';
import { inArray, eq, and, or } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';

export interface CoverPhotoMeta {
  uri: string;
  attribution: AttributionMeta | null;
  source: string;
}

export interface PlaceWithCover extends Place {
  coverUrl?: string;
  coverAttribution?: AttributionMeta | null;
  coverSource?: string | null;
}

/**
 * Cover-augmented row for /library and /archive routes.
 * Extends LibraryPlace (narrow projection) instead of Place.
 */
export interface LibraryPlaceWithCover extends LibraryPlace {
  coverUrl?: string;
  coverAttribution?: AttributionMeta | null;
  coverSource?: string | null;
}

export interface CollectionCardCover {
  coverUrl: string | null;
  coverAttribution: AttributionMeta | null;
  coverSource: string | null;
}

export function adaptPlaceForCard(
  place: Place,
  cover?: CoverPhotoMeta | string | undefined
): PlaceWithCover {
  if (typeof cover === 'string') {
    return { ...place, coverUrl: cover };
  }
  if (!cover) {
    return { ...place };
  }
  return {
    ...place,
    coverUrl: cover.uri,
    coverAttribution: cover.attribution,
    coverSource: cover.source,
  };
}

/**
 * Primary cover photos for a list of place ids.
 *
 * `userId` is required, and the query is scoped through the caller's places —
 * `attachments` carries no `user_id` of its own. The id list is an input to
 * filter, not a statement about ownership: this used to take bare place ids and
 * was safe only because both call sites happened to pass an already-scoped
 * list. Safe by signature beats safe by caller discipline.
 */
export async function getCoverImagesForPlaces(
  placeIds: string[],
  userId: string
): Promise<Map<string, CoverPhotoMeta>> {
  if (placeIds.length === 0) return new Map();

  const covers = await forUser(userId).selectFieldsVia(
    attachments,
    {
      placeId: attachments.placeId,
      uri: attachments.uri,
      attribution: attachments.attribution,
      source: attachments.source,
    },
    and(inArray(attachments.placeId, placeIds), eq(attachments.isPrimary, 1))
  );

  return new Map(
    covers.map((cover) => [
      cover.placeId,
      {
        uri: cover.uri,
        attribution: cover.attribution ?? null,
        source: cover.source,
      },
    ])
  );
}

export interface CoverCredit {
  attribution: AttributionMeta | null;
  source: string | null;
}

export function attachmentIdFromCoverUrl(coverUrl: string): string | null {
  const match = /\/api\/photos\/resolve\/([^/?#]+)/.exec(coverUrl);
  return match?.[1] ?? null;
}

export async function getCreditsForCoverUrls(
  coverUrls: Array<string | null | undefined>,
  userId: string,
): Promise<Map<string, CoverCredit>> {
  const urls = [...new Set(coverUrls.filter((url): url is string => Boolean(url)))];
  const result = new Map<string, CoverCredit>();
  if (urls.length === 0) return result;

  const ids = [...new Set(
    urls.map(attachmentIdFromCoverUrl).filter((id): id is string => Boolean(id)),
  )];
  const where = ids.length > 0
    ? or(
        inArray(attachments.uri, urls),
        inArray(attachments.thumbnailUri, urls),
        inArray(attachments.id, ids),
      )
    : or(inArray(attachments.uri, urls), inArray(attachments.thumbnailUri, urls));

  const rows = await forUser(userId).selectFieldsVia(
    attachments,
    {
      id: attachments.id,
      uri: attachments.uri,
      thumbnailUri: attachments.thumbnailUri,
      attribution: attachments.attribution,
      source: attachments.source,
    },
    where,
  );

  for (const url of urls) {
    const id = attachmentIdFromCoverUrl(url);
    const row =
      rows.find((candidate) => candidate.uri === url) ??
      rows.find((candidate) => candidate.thumbnailUri === url) ??
      (id ? rows.find((candidate) => candidate.id === id) : undefined);
    if (!row) continue;
    result.set(url, {
      attribution: row.attribution ?? null,
      source: row.source,
    });
  }

  return result;
}

export function collectionCoverForCard(
  coverImageUrl: string | null | undefined,
  fallback: CollectionCardCover | undefined,
  customCredit: CoverCredit | undefined,
): {
  coverAttribution: AttributionMeta | null;
  coverSource: string | null;
  places:
    | Array<{
        coverUrl: string;
        coverAttribution: AttributionMeta | null;
        coverSource: string | null;
      }>
    | undefined;
} {
  const useCustomCover = Boolean(coverImageUrl);
  return {
    coverAttribution: useCustomCover
      ? (customCredit?.attribution ?? null)
      : (fallback?.coverAttribution ?? null),
    coverSource: useCustomCover
      ? (customCredit?.source ?? null)
      : (fallback?.coverSource ?? null),
    places: fallback?.coverUrl
      ? [{
          coverUrl: fallback.coverUrl,
          coverAttribution: fallback.coverAttribution,
          coverSource: fallback.coverSource,
        }]
      : undefined,
  };
}

/**
 * Fallback cover when a collection has no custom `cover_image_url`: the first
 * place in list order (pinned first), then its primary photo.
 */
export async function getCollectionCardCovers(
  collectionIds: string[],
  userId: string
): Promise<Map<string, CollectionCardCover>> {
  const result = new Map<string, CollectionCardCover>();
  if (collectionIds.length === 0) return result;

  const tdb = forUser(userId);
  const memberships = await tdb.selectFieldsVia(
    placesToCollections,
    {
      collectionId: placesToCollections.collectionId,
      placeId: placesToCollections.placeId,
      orderIndex: placesToCollections.orderIndex,
      isPinned: placesToCollections.isPinned,
    },
    inArray(placesToCollections.collectionId, collectionIds)
  );

  const firstPlaceByCollection = new Map<string, string>();
  const sorted = [...memberships].sort((a, b) => {
    if (a.collectionId !== b.collectionId) return a.collectionId.localeCompare(b.collectionId);
    return Number(b.isPinned) - Number(a.isPinned) || a.orderIndex - b.orderIndex;
  });
  for (const row of sorted) {
    if (!firstPlaceByCollection.has(row.collectionId)) {
      firstPlaceByCollection.set(row.collectionId, row.placeId);
    }
  }

  const placeIds = [...new Set(firstPlaceByCollection.values())];
  const covers = await getCoverImagesForPlaces(placeIds, userId);

  for (const collectionId of collectionIds) {
    const placeId = firstPlaceByCollection.get(collectionId);
    const cover = placeId ? covers.get(placeId) : undefined;
    result.set(collectionId, {
      coverUrl: cover?.uri ?? null,
      coverAttribution: cover?.attribution ?? null,
      coverSource: cover?.source ?? null,
    });
  }

  return result;
}
