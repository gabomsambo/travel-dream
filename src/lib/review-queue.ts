import { eq, inArray } from 'drizzle-orm'
import { places, sources, sourcesToPlaces } from '@/db/schema'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { getExploreCollections, getExplorePlacesInCity } from '@/lib/explore/queries'
import { forUser } from '@/lib/tenant-db'
import type { ExploreCollection, ExplorePlace } from '@/lib/explore/types'
import type { PlaceWithRelations, Source } from '@/types/database'

/** Screenshot order and the chrome for one inbox row. Not the postcard. */
export interface ReviewQueueEntry {
  placeId: string
  name: string
  createdAt: string
  userId: string
  source: Source | null
  screenshotUrl: string | null
  screenshotName: string | null
  uploadLabel: string
}

/** Relations and the city rail for the one place on screen. */
export interface ReviewPostcard {
  place: PlaceWithRelations
  alsoIn: ExplorePlace[]
}

export interface ReviewQueueData {
  entries: ReviewQueueEntry[]
  postcard: ReviewPostcard | null
  trips: ExploreCollection[]
}

function sourceTime(source: Source | null): string {
  return source?.createdAt ?? ''
}

function sourceName(source: Source | null): string | null {
  if (!source) return null
  const upload = source.meta?.uploadInfo
  return upload?.originalName ?? upload?.filename ?? source.meta?.filename ?? null
}

function screenshotSource(placeSources: Source[]): Source | null {
  const ordered = [...placeSources].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  )
  return ordered.find((source) => source.type === 'screenshot') ?? ordered[0] ?? null
}

function compareEntries(a: ReviewQueueEntry, b: ReviewQueueEntry): number {
  const bySourceTime = sourceTime(b.source).localeCompare(sourceTime(a.source))
  if (bySourceTime !== 0) return bySourceTime
  const bySource = (a.source?.id ?? '').localeCompare(b.source?.id ?? '')
  if (bySource !== 0) return bySource
  const byPlaceTime = a.createdAt.localeCompare(b.createdAt)
  return byPlaceTime || a.placeId.localeCompare(b.placeId)
}

/**
 * Inbox rows in screenshot order, from two scoped reads (places, then their
 * sources). Extraction order belongs to the later group-review PR because the
 * join table itself has no ordering column.
 */
async function loadReviewEntries(userId: string): Promise<ReviewQueueEntry[]> {
  const scoped = forUser(userId)
  const inbox = await scoped.selectFields(places, {
    id: places.id,
    name: places.name,
    createdAt: places.createdAt,
    userId: places.userId,
  }, eq(places.status, 'inbox'))
  if (inbox.length === 0) return []

  const placeIds = inbox.map((row) => row.id)
  const links = await scoped.selectFieldsVia(
    sourcesToPlaces,
    { sourceId: sourcesToPlaces.sourceId, placeId: sourcesToPlaces.placeId },
    inArray(sourcesToPlaces.placeId, placeIds),
  )
  const sourceIds = [...new Set(links.map((link) => link.sourceId))]
  const sourceRows = sourceIds.length
    ? await scoped.select(sources, inArray(sources.id, sourceIds))
    : []
  const sourcesById = new Map(sourceRows.map((source) => [source.id, source]))
  const sourcesByPlace = new Map<string, Source[]>()
  for (const link of links) {
    const source = sourcesById.get(link.sourceId)
    if (!source) continue
    const list = sourcesByPlace.get(link.placeId) ?? []
    list.push(source)
    sourcesByPlace.set(link.placeId, list)
  }

  return inbox.map((row) => {
    const source = screenshotSource(sourcesByPlace.get(row.id) ?? [])
    const name = sourceName(source)
    return {
      placeId: row.id,
      name: row.name,
      createdAt: row.createdAt,
      userId: row.userId,
      source,
      screenshotUrl: source?.uri ?? null,
      screenshotName: name,
      uploadLabel: name ?? 'your upload',
    }
  }).sort(compareEntries)
}

/** Postcard payload for one owned place. Null when the id is missing or someone else's. */
export async function loadReviewPostcard(userId: string, placeId: string): Promise<ReviewPostcard | null> {
  const place = await getPlaceWithRelations(placeId, userId)
  if (!place) return null
  const alsoIn = place.city
    ? await getExplorePlacesInCity(userId, place.city, place.country, place.id)
    : []
  return { place, alsoIn }
}

/**
 * Queue order and light rows for every inbox place, and relations plus the
 * city rail only for `visiblePlaceId` (or the first row, when that id is
 * absent or no longer inbox).
 */
export async function loadReviewQueue(userId: string, visiblePlaceId?: string): Promise<ReviewQueueData> {
  const [entries, trips] = await Promise.all([
    loadReviewEntries(userId),
    getExploreCollections(userId),
  ])
  const visible = visiblePlaceId && entries.some((entry) => entry.placeId === visiblePlaceId)
    ? visiblePlaceId
    : entries[0]?.placeId
  const postcard = visible ? await loadReviewPostcard(userId, visible) : null
  return { entries, trips, postcard }
}
