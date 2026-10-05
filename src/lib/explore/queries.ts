import { and, eq, inArray, ne, type SQL } from 'drizzle-orm';
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

const PLACE_FIELDS = {
  id: places.id, name: places.name, kind: places.kind, city: places.city, country: places.country,
  description: places.description, notes: places.notes, vibes: places.vibes, bestTime: places.best_time,
  recommendedBy: places.recommendedBy, visitStatus: places.visitStatus, priority: places.priority,
  ratingSelf: places.ratingSelf, priceLevel: places.price_level, createdAt: places.createdAt, coords: places.coords,
  lastVisited: places.lastVisited, plannedVisit: places.plannedVisit,
};

const PHOTO_FIELDS = {
  placeId: attachments.placeId, uri: attachments.uri, thumb: attachments.thumbnailUri, isPrimary: attachments.isPrimary, createdAt: attachments.createdAt,
};

interface PlaceRow {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  country: string | null;
  description: string | null;
  notes: string | null;
  vibes: string[] | null;
  bestTime: string | null;
  recommendedBy: string | null;
  visitStatus: string | null;
  priority: number | null;
  ratingSelf: number | null;
  priceLevel: string | null;
  createdAt: string;
  coords: { lat: number; lon: number } | null;
  lastVisited: string | null;
  plannedVisit: string | null;
}

interface PhotoRow {
  placeId: string;
  uri: string;
  thumb: string | null;
  isPrimary: number | null;
  createdAt: string;
}

/**
 * The shared projection from place + photo rows to `ExplorePlace`. Both queries
 * below feed it, so the photo ordering, `/uploads/` filtering and status
 * normalization stay in one place.
 */
function mapExplorePlaces(rows: PlaceRow[], photos: PhotoRow[]): ExplorePlace[] {
  const byPlace = new Map<string, PhotoRow[]>();
  for (const ph of photos) byPlace.set(ph.placeId, [...(byPlace.get(ph.placeId) ?? []), ph]);

  return rows.map((r) => {
    const coords = r.coords && typeof r.coords === 'object' ? r.coords : null;
    const pics = (byPlace.get(r.id) ?? [])
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.localeCompare(b.createdAt))
      // Both sizes travel together: rails and covers render the thumbnail, the
      // hero and the sheet render the full image.
      .map((a) => ({ uri: a.uri, thumb: a.thumb || a.uri }))
      // Pre-Blob /uploads/ rows never existed on Vercel; treat them as missing (AGENTS.md § File Storage).
      .filter((p) => !p.uri.startsWith('/uploads/'))
      .slice(0, PHOTOS_PER_PLACE);
    const visit = r.visitStatus === 'visited' || r.visitStatus === 'planned' ? r.visitStatus : 'not_visited';
    return {
      id: r.id, name: r.name, kind: r.kind, city: r.city, country: r.country, description: r.description, notes: r.notes,
      vibes: asArray(r.vibes), bestTimeText: r.bestTime, bestTime: parseBestTime(r.bestTime, coords?.lat),
      recommendedBy: r.recommendedBy, visitStatus: visit, priority: r.priority ?? 0, ratingSelf: r.ratingSelf ?? 0,
      priceLevel: r.priceLevel, createdAt: r.createdAt,
      lastVisited: r.lastVisited, plannedVisit: r.plannedVisit, lat: coords?.lat ?? null, lon: coords?.lon ?? null, photos: pics,
    };
  });
}

/** Both queries go through `forUser`, so neither can return another tenant's rows. */
async function queryExplorePlaces(
  scoped: ReturnType<typeof forUser>,
  placeFilter: SQL | undefined,
  photoFilter: SQL | undefined
): Promise<ExplorePlace[]> {
  const [rows, photos] = await Promise.all([
    scoped.selectFields(places, PLACE_FIELDS, placeFilter),
    scoped.selectFieldsVia(attachments, PHOTO_FIELDS, photoFilter),
  ]);
  return mapExplorePlaces(rows, photos);
}

/**
 * Every browsable place for one user, with photos (primary first).
 */
export async function getExplorePlaces(userId: string): Promise<ExplorePlace[]> {
  const scoped = forUser(userId);
  return queryExplorePlaces(scoped, inArray(places.status, BROWSABLE), eq(attachments.type, 'photo'));
}

/**
 * The user's other browsable places in one city, for the "Also in {city}" rail
 * on the place page. Scoped to the caller and filtered to the city, so it can
 * neither leak another tenant's rows nor pull in a same-named city elsewhere.
 */
export async function getExplorePlacesInCity(
  userId: string,
  city: string,
  country: string | null,
  excludeId: string
): Promise<ExplorePlace[]> {
  const scoped = forUser(userId);
  const conditions: SQL[] = [
    eq(places.city, city),
    ne(places.id, excludeId),
    inArray(places.status, BROWSABLE),
  ];
  if (country) conditions.push(eq(places.country, country));
  const inCity = and(...conditions);
  const ids = await scoped.selectFields(places, { id: places.id }, inCity);
  if (ids.length === 0) return [];
  const idList = ids.map((r) => r.id);
  return queryExplorePlaces(
    scoped,
    inArray(places.id, idList),
    and(inArray(attachments.placeId, idList), eq(attachments.type, 'photo'))
  );
}

export async function getExploreCollections(userId: string): Promise<ExploreCollection[]> {
  const scoped = forUser(userId);
  const [cols, links] = await Promise.all([
    scoped.selectFields(collections, { id: collections.id, name: collections.name, description: collections.description }),
    scoped.selectFieldsVia(placesToCollections, { placeId: placesToCollections.placeId, collectionId: placesToCollections.collectionId }),
  ]);
  return cols.map((c) => ({ id: c.id, name: c.name, description: c.description, placeIds: links.filter((l) => l.collectionId === c.id).map((l) => l.placeId) }));
}

/** Everything an Explore page needs, in one call. */
export async function loadExplore(userId: string) {
  const [placesList, cols] = await Promise.all([getExplorePlaces(userId), getExploreCollections(userId)]);
  return { places: placesList, collections: cols };
}

