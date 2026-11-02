import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { places, sourcesToPlaces } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { forUser } from '@/lib/tenant-db';
import type { LinkKind, LinkPlatform } from '@/types/link-import';

const MAX_INBOX_LINKS = 30;

export interface InboxLinkItem {
  id: string;
  url: string;
  createdAt: string;
  platform: LinkPlatform;
  kind: LinkKind;
  processingStatus: string;
  title: string | null;
  author: string | null;
  placeName: string | null;
  hasHelpfulContext: boolean;
  resolutionStatus: string;
  places: Array<{ id: string; name: string; status: string }>;
}

/** Recent social links and their own user's extracted places for the Inbox. */
export async function getInboxLinkItems(userId: string): Promise<InboxLinkItem[]> {
  const tdb = forUser(userId);
  const sources = await tdb.select(sourcesCurrentSchema, eq(sourcesCurrentSchema.type, 'url'))
    .orderBy(desc(sourcesCurrentSchema.createdAt))
    .limit(MAX_INBOX_LINKS);
  if (sources.length === 0) return [];

  const sourceIds = sources.map((source) => source.id);
  const edges = await tdb.selectFieldsVia(
    sourcesToPlaces,
    { sourceId: sourcesToPlaces.sourceId, placeId: sourcesToPlaces.placeId },
    inArray(sourcesToPlaces.sourceId, sourceIds),
  );
  const placeIds = Array.from(new Set(edges.map((edge) => edge.placeId)));
  const placeRows = placeIds.length === 0
    ? []
    : await tdb.selectFields(
        places,
        { id: places.id, name: places.name, status: places.status },
        inArray(places.id, placeIds),
      );
  const placesById = new Map(placeRows.map((place) => [place.id, place]));
  const sourcePlaces = new Map<string, InboxLinkItem['places']>();
  for (const edge of edges) {
    const place = placesById.get(edge.placeId);
    if (!place) continue;
    const list = sourcePlaces.get(edge.sourceId) ?? [];
    list.push({ id: place.id, name: place.name, status: place.status });
    sourcePlaces.set(edge.sourceId, list);
  }

  return sources.flatMap((source) => {
    const link = source.meta?.link;
    if (!link || (link.platform !== 'tiktok' && link.platform !== 'instagram')) return [];
    const details = link.details;
    const placeName = link.placeName ?? details?.placeName ?? null;
    const title = details?.title ?? source.meta?.title ?? null;
    const author = details?.author ?? source.meta?.author ?? null;
    const hasHelpfulContext = Boolean(
      link.captionText?.trim() || details?.caption?.trim() || title?.trim() || placeName?.trim()
    );
    return [{
      id: source.id,
      url: source.uri,
      createdAt: source.createdAt,
      platform: link.platform,
      kind: link.kind,
      processingStatus: source.processingStatus ?? 'pending',
      title,
      author,
      placeName,
      hasHelpfulContext,
      resolutionStatus: link.resolution.status,
      places: sourcePlaces.get(source.id) ?? [],
    }];
  });
}
