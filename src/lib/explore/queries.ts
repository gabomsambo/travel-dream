import { eq, inArray } from 'drizzle-orm';
import { attachments, collections, places, placesToCollections } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import { parseBestTime } from './best-time';
import type { ExploreCollection, ExplorePlace } from './types';

/** Explore browses what the user has kept: confirmed (library) and not-yet-reviewed (inbox). Archived stays out. */
const BROWSABLE = ['library', 'inbox'];
/** Photos per place shipped to the client — enough for Shuffle's photo bars. */
const PHOTOS_PER_PLACE = 4;

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Every browsable place for one user, with photos (primary first).
 * Both queries go through `forUser`, so neither can return another tenant's rows.
 */
export async function getExplorePlaces(userId: string): Promise<ExplorePlace[]> {
  const scoped = forUser(userId);
  const [rows, photos] = await Promise.all([
    scoped.selectFields(
      places,
      {
        id: places.id, name: places.name, kind: places.kind, city: places.city, country: places.country,
        description: places.description, notes: places.notes, vibes: places.vibes, bestTime: places.best_time,
        recommendedBy: places.recommendedBy, visitStatus: places.visitStatus, priority: places.priority,
        ratingSelf: places.ratingSelf, priceLevel: places.price_level, createdAt: places.createdAt, coords: places.coords,
      },
      inArray(places.status, BROWSABLE)
    ),
    scoped.selectFieldsVia(
      attachments,
      { placeId: attachments.placeId, uri: attachments.uri, thumb: attachments.thumbnailUri, isPrimary: attachments.isPrimary, createdAt: attachments.createdAt },
      eq(attachments.type, 'photo')
    ),
  ]);

  const byPlace = new Map<string, typeof photos>();
  for (const ph of photos) byPlace.set(ph.placeId, [...(byPlace.get(ph.placeId) ?? []), ph]);

  return rows.map((r) => {
    const coords = r.coords && typeof r.coords === 'object' ? r.coords : null;
    const pics = (byPlace.get(r.id) ?? [])
      .sort((a, b) => b.isPrimary - a.isPrimary || a.createdAt.localeCompare(b.createdAt))
      .map((a) => a.uri)
      // Pre-Blob /uploads/ rows never existed on Vercel; treat them as missing (AGENTS.md § File Storage).
      .filter((u) => !u.startsWith('/uploads/'))
      .slice(0, PHOTOS_PER_PLACE);
    const visit = r.visitStatus === 'visited' || r.visitStatus === 'planned' ? r.visitStatus : 'not_visited';
    return {
      id: r.id, name: r.name, kind: r.kind, city: r.city, country: r.country, description: r.description, notes: r.notes,
      vibes: asArray(r.vibes), bestTimeText: r.bestTime, bestTime: parseBestTime(r.bestTime, coords?.lat),
      recommendedBy: r.recommendedBy, visitStatus: visit, priority: r.priority ?? 0, ratingSelf: r.ratingSelf ?? 0,
      priceLevel: r.priceLevel, createdAt: r.createdAt, lat: coords?.lat ?? null, lon: coords?.lon ?? null, photos: pics,
    };
  });
}

export async function getExploreCollections(userId: string): Promise<ExploreCollection[]> {
  const scoped = forUser(userId);
  const [cols, links] = await Promise.all([
    scoped.selectFields(collections, { id: collections.id, name: collections.name }),
    scoped.selectFieldsVia(placesToCollections, { placeId: placesToCollections.placeId, collectionId: placesToCollections.collectionId }),
  ]);
  return cols.map((c) => ({ id: c.id, name: c.name, placeIds: links.filter((l) => l.collectionId === c.id).map((l) => l.placeId) }));
}

/** Everything an Explore page needs, in one call. */
export async function loadExplore(userId: string) {
  const [placesList, cols] = await Promise.all([getExplorePlaces(userId), getExploreCollections(userId)]);
  return { places: placesList, collections: cols };
}

