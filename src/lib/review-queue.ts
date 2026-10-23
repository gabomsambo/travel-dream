import { eq, inArray, sql } from 'drizzle-orm'
import { places, sources, sourcesToPlaces } from '@/db/schema'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { getExploreCollections, getExplorePlacesInCity } from '@/lib/explore/queries'
import { forUser } from '@/lib/tenant-db'
import type { ExploreCollection, ExplorePlace } from '@/lib/explore/types'
import type { PlaceWithRelations } from '@/types/database'

/** Screenshot order and the chrome for one inbox row. Not the postcard. */
export interface ReviewQueueEntry {
  placeId: string
  name: string
  createdAt: string
  userId: string
  screenshotUrl: string | null
  screenshotName: string | null
  uploadLabel: string
}

interface QueueSource {
  id: string
  type: string
  uri: string
  createdAt: string
  originalName: string | null
  uploadFilename: string | null
  filename: string | null
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

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function sourceName(source: QueueSource | null): string | null {
  if (!source) return null
  return source.originalName ?? source.uploadFilename ?? source.filename ?? null
}

function screenshotSource(placeSources: QueueSource[]): QueueSource | null {
  const ordered = [...placeSources].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  )
  return ordered.find((source) => source.type === 'screenshot') ?? ordered[0] ?? null
}

function compareEntries(
  a: ReviewQueueEntry & { sourceCreatedAt: string; sourceId: string },
  b: ReviewQueueEntry & { sourceCreatedAt: string; sourceId: string },
): number {
  const bySourceTime = b.sourceCreatedAt.localeCompare(a.sourceCreatedAt)
  if (bySourceTime !== 0) return bySourceTime
  const bySource = a.sourceId.localeCompare(b.sourceId)
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
    ? await scoped.selectFields(sources, {
        id: sources.id,
        type: sources.type,
        uri: sources.uri,
        createdAt: sources.createdAt,
        originalName: sql<string | null>`json_extract(${sources.meta}, '$.uploadInfo.originalName')`,
        uploadFilename: sql<string | null>`json_extract(${sources.meta}, '$.uploadInfo.filename')`,
        filename: sql<string | null>`json_extract(${sources.meta}, '$.filename')`,
      }, inArray(sources.id, sourceIds))
    : []
  const sourcesById = new Map(sourceRows.map((source) => [source.id, {
    id: source.id,
    type: source.type,
    uri: source.uri,
    createdAt: source.createdAt,
    originalName: textOrNull(source.originalName),
    uploadFilename: textOrNull(source.uploadFilename),
    filename: textOrNull(source.filename),
  } satisfies QueueSource]))
  const sourcesByPlace = new Map<string, QueueSource[]>()
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
      sourceCreatedAt: source?.createdAt ?? '',
      sourceId: source?.id ?? '',
      screenshotUrl: source?.uri ?? null,
      screenshotName: name,
      uploadLabel: name ?? 'your upload',
    }
  }).sort(compareEntries).map((draft) => ({
    placeId: draft.placeId,
    name: draft.name,
    createdAt: draft.createdAt,
    userId: draft.userId,
    screenshotUrl: draft.screenshotUrl,
    screenshotName: draft.screenshotName,
    uploadLabel: draft.uploadLabel,
  }))
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
