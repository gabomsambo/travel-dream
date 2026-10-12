import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { attachments, dismissedDuplicates, mergeLogs, places, sources, sourcesToPlaces } from '@/db/schema';
import type { DuplicateCluster } from '@/lib/duplicate-detection';
import {
  mergedOnForCluster,
  type DismissedPairView,
  type MergedGroupView,
  type MergeLogMatch,
} from '@/lib/duplicate-certainty';

interface PhotoRow {
  placeId: string;
  uri: string;
  isPrimary: number;
}

/**
 * Queue fields the clusters payload did not carry yet: screenshot counts,
 * whether a photo exists, the merged-on date, the Not duplicates list, and
 * the Merged list. Merge history joins `merge_logs` to the caller's places.
 */
export async function loadDuplicateQueueExtras(
  userId: string,
  clusters: DuplicateCluster[],
  possible: DuplicateCluster[],
): Promise<{
  clusters: DuplicateCluster[];
  possible: DuplicateCluster[];
  dismissed: DismissedPairView[];
  merged: MergedGroupView[];
}> {
  const memberIds = [...new Set(
    [...clusters, ...possible].flatMap((cluster) => cluster.places.map((place) => place.id)),
  )];

  const [shotCounts, photoUrls, logs, dismissed] = await Promise.all([
    screenshotCounts(userId, memberIds),
    photoUrlsFor(memberIds),
    mergeLogsFor(userId),
    dismissedPairsFor(userId),
  ]);

  const apply = (cluster: DuplicateCluster): DuplicateCluster => ({
    ...cluster,
    places: cluster.places.map((place) => ({
      ...place,
      screenshotCount: shotCounts.get(place.id) ?? 0,
      hasPhoto: photoUrls.has(place.id),
      photoUrl: photoUrls.get(place.id) ?? null,
    })),
    mergedOn: mergedOnForCluster(cluster, logs),
  });

  return {
    clusters: clusters.map(apply),
    possible: possible.map(apply),
    dismissed,
    merged: logs
      .map((log) => ({
        id: log.id,
        keptPlaceId: log.targetId,
        keptName: log.keptName,
        performedAt: log.performedAt,
        placeCount: log.sourceIds.length + 1,
      }))
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt)),
  };
}

async function screenshotCounts(userId: string, placeIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (placeIds.length === 0) return counts;

  const links = await db.select({
    sourceId: sourcesToPlaces.sourceId,
    placeId: sourcesToPlaces.placeId,
  }).from(sourcesToPlaces).where(inArray(sourcesToPlaces.placeId, placeIds));

  if (links.length === 0) return counts;
  const sourceIds = [...new Set(links.map((link) => link.sourceId))];
  const shots = await db.select({ id: sources.id }).from(sources).where(and(
    inArray(sources.id, sourceIds),
    eq(sources.userId, userId),
    eq(sources.type, 'screenshot'),
  ));
  const shotIds = new Set(shots.map((shot) => shot.id));
  for (const link of links) {
    if (!shotIds.has(link.sourceId)) continue;
    counts.set(link.placeId, (counts.get(link.placeId) ?? 0) + 1);
  }
  return counts;
}

async function photoUrlsFor(placeIds: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (placeIds.length === 0) return urls;

  const rows = await db.select({
    placeId: attachments.placeId,
    uri: attachments.uri,
    isPrimary: attachments.isPrimary,
    type: attachments.type,
  }).from(attachments).where(inArray(attachments.placeId, placeIds));

  const best = new Map<string, PhotoRow>();
  for (const row of rows) {
    if (row.type !== 'photo') continue;
    const current = best.get(row.placeId);
    if (!current || (row.isPrimary === 1 && current.isPrimary !== 1)) {
      best.set(row.placeId, { placeId: row.placeId, uri: row.uri, isPrimary: row.isPrimary });
    }
  }
  for (const [placeId, photo] of best) urls.set(placeId, photo.uri);
  return urls;
}

interface OwnedMergeLog extends MergeLogMatch {
  id: string;
  keptName: string;
  sourceIds: string[];
}

async function mergeLogsFor(userId: string): Promise<OwnedMergeLog[]> {
  const rows = await db.select({
    id: mergeLogs.id,
    targetId: mergeLogs.targetId,
    sourceIds: mergeLogs.sourceIds,
    performedAt: mergeLogs.performedAt,
    undone: mergeLogs.undone,
    sourceSnapshots: mergeLogs.sourceSnapshots,
    keptName: places.name,
  }).from(mergeLogs)
    .innerJoin(places, eq(places.id, mergeLogs.targetId))
    .where(and(
      eq(places.userId, userId),
      eq(mergeLogs.undone, false),
    ));

  return rows.map((row) => ({
    id: row.id,
    targetId: row.targetId,
    keptName: row.keptName,
    sourceIds: Array.isArray(row.sourceIds) ? row.sourceIds : [],
    performedAt: row.performedAt,
    undone: row.undone,
    sourceSnapshots: row.sourceSnapshots,
  }));
}

async function dismissedPairsFor(userId: string): Promise<DismissedPairView[]> {
  const rows = await db.select().from(dismissedDuplicates)
    .where(eq(dismissedDuplicates.userId, userId));
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((row) => [row.placeId1, row.placeId2]))];
  const named = ids.length === 0 ? [] : await db.select({
    id: places.id,
    name: places.name,
    city: places.city,
  }).from(places).where(and(eq(places.userId, userId), inArray(places.id, ids)));
  const byId = new Map(named.map((place) => [place.id, place]));

  const seen = new Set<string>();
  const pairs: DismissedPairView[] = [];
  for (const row of rows) {
    const key = [row.placeId1, row.placeId2].sort().join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    const first = byId.get(row.placeId1);
    const second = byId.get(row.placeId2);
    pairs.push({
      placeId1: row.placeId1,
      placeId2: row.placeId2,
      name1: first?.name ?? row.placeId1,
      name2: second?.name ?? row.placeId2,
      city1: first?.city ?? null,
      city2: second?.city ?? null,
      dismissedAt: row.dismissedAt,
    });
  }
  return pairs.sort((a, b) => b.dismissedAt.localeCompare(a.dismissedAt));
}
