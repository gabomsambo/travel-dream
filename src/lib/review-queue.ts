import { eq, inArray, sql } from 'drizzle-orm'
import { places, sources, sourcesToPlaces } from '@/db/schema'
import { coverPhoto } from '@/lib/cover-photo'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { getExploreCollections, getExplorePlacesInCity } from '@/lib/explore/queries'
import { rankingSource } from '@/lib/review-order'
import {
  compareExtractionOrder,
  extractionOrderByPlaceId,
  namesFromExtraction,
  namesFromPlaces,
  placeHasPin,
  reviewQuote,
} from '@/lib/review-group'
import { forUser } from '@/lib/tenant-db'
import type { ExploreCollection, ExplorePlace } from '@/lib/explore/types'
import type { PlaceWithRelations } from '@/types/database'

/** Screenshot order and the chrome for one inbox row. Not the postcard. */
export interface ReviewQueueEntry {
  placeId: string
  name: string
  createdAt: string
  userId: string
  /** Screenshot this row was read from. Empty when the place has no source. Shared by a group. */
  sourceId: string
  screenshotUrl: string | null
  screenshotName: string | null
  screenshotCreatedAt: string | null
  uploadLabel: string
  kind: string
  city: string | null
  /** One line from the place description: the post's words, for a group row. */
  quote: string | null
  hasPin: boolean
}

/** A trip the batch can file into. `cities` lists one city per member place that has one. */
export interface ReviewTrip extends ExploreCollection {
  cities: string[]
}

interface QueueSource {
  id: string
  type: string
  uri: string
  createdAt: string
  originalName: string | null
  uploadFilename: string | null
  filename: string | null
  sessionId: string | null
  /** Place names in Gemini's order. Never the rest of the extraction cache. */
  extractionNames: string[]
}

/** Another place found in the same screenshot, including the one on screen. */
export interface ReviewScreenshotSibling {
  placeId: string
  name: string
  status: string
  createdAt: string
}

/**
 * The screenshot beside the postcard. `siblings` is every place linked to that
 * source. `softCover` is true when the cover photo is that shared screenshot,
 * so the hero should blur it and offer Find a photo.
 */
export interface ReviewScreenshot {
  sourceId: string
  url: string
  name: string | null
  createdAt: string
  siblings: ReviewScreenshotSibling[]
  softCover: boolean
}

/** Relations, the city rail, and the screenshot for the one place on screen. */
export interface ReviewPostcard {
  place: PlaceWithRelations
  alsoIn: ExplorePlace[]
  screenshot: ReviewScreenshot | null
}

export interface ReviewQueueData {
  entries: ReviewQueueEntry[]
  postcard: ReviewPostcard | null
  trips: ReviewTrip[]
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function sourceName(source: QueueSource | null): string | null {
  if (!source) return null
  return source.originalName ?? source.uploadFilename ?? source.filename ?? null
}

function nameFromSourceMeta(meta: { uploadInfo?: { originalName?: string; filename?: string }; filename?: string } | null): string | null {
  if (!meta) return null
  return meta.uploadInfo?.originalName ?? meta.uploadInfo?.filename ?? meta.filename ?? null
}

/**
 * A multi-place screenshot is a poor cover: every place would show the same
 * unreadable crop. Blur it when that file is the cover — the primary photo,
 * or the first photo when none is primary — even if other photos sit behind it.
 */
export function isSharedScreenshotCover(
  attachments: Array<{ type: string; uri: string; isPrimary?: number | null }>,
  screenshotUrl: string,
  siblingCount: number,
): boolean {
  if (siblingCount < 2 || !screenshotUrl) return false
  return coverPhoto(attachments)?.uri === screenshotUrl
}

function compareEntries(
  a: ReviewQueueEntry & { sourceCreatedAt: string; extractionIndex: number | null },
  b: ReviewQueueEntry & { sourceCreatedAt: string; extractionIndex: number | null },
): number {
  const bySourceTime = b.sourceCreatedAt.localeCompare(a.sourceCreatedAt)
  if (bySourceTime !== 0) return bySourceTime
  const bySource = a.sourceId.localeCompare(b.sourceId)
  if (bySource !== 0) return bySource
  const order = new Map<string, number>()
  if (a.extractionIndex != null) order.set(a.placeId, a.extractionIndex)
  if (b.extractionIndex != null) order.set(b.placeId, b.extractionIndex)
  return compareExtractionOrder(a, b, order)
}

/**
 * Inbox rows in screenshot order. Within one screenshot the order is Gemini's
 * `extraction.places` list; places that list does not name keep created-at
 * order after the ones it does. The join table has no order column.
 */
async function loadReviewEntries(userId: string, uploadSessionId?: string): Promise<ReviewQueueEntry[]> {
  const scoped = forUser(userId)
  const inbox = await scoped.selectFields(places, {
    id: places.id,
    name: places.name,
    createdAt: places.createdAt,
    userId: places.userId,
    kind: places.kind,
    city: places.city,
    description: places.description,
    coords: places.coords,
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
        sessionId: sql<string | null>`json_extract(${sources.meta}, '$.uploadInfo.sessionId')`,
        extractionPlaces: sql<unknown>`json_extract(${sources.meta}, '$.massUpload.extraction.places')`,
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
    sessionId: textOrNull(source.sessionId),
    extractionNames: namesFromPlaces(source.extractionPlaces),
  } satisfies QueueSource]))
  const sourcesByPlace = new Map<string, QueueSource[]>()
  for (const link of links) {
    const source = sourcesById.get(link.sourceId)
    if (!source) continue
    const list = sourcesByPlace.get(link.placeId) ?? []
    list.push(source)
    sourcesByPlace.set(link.placeId, list)
  }

  const placesBySource = new Map<string, Array<{ id: string; name: string; createdAt: string }>>()
  for (const link of links) {
    const place = inbox.find((row) => row.id === link.placeId)
    if (!place) continue
    const list = placesBySource.get(link.sourceId) ?? []
    list.push({ id: place.id, name: place.name, createdAt: place.createdAt })
    placesBySource.set(link.sourceId, list)
  }
  const orderBySource = new Map<string, Map<string, number>>()
  for (const [sourceId, group] of placesBySource) {
    orderBySource.set(sourceId, extractionOrderByPlaceId(sourcesById.get(sourceId)?.extractionNames ?? [], group))
  }

  return inbox.flatMap((row) => {
    const placeSources = sourcesByPlace.get(row.id) ?? []
    if (uploadSessionId && !placeSources.some((source) => source.sessionId === uploadSessionId)) return []
    const source = rankingSource(placeSources, uploadSessionId)
    const name = sourceName(source)
    return [{
      placeId: row.id,
      name: row.name,
      createdAt: row.createdAt,
      userId: row.userId,
      sourceCreatedAt: source?.createdAt ?? '',
      sourceId: source?.id ?? '',
      extractionIndex: source ? orderBySource.get(source.id)?.get(row.id) ?? null : null,
      screenshotUrl: source?.uri ?? null,
      screenshotName: name,
      screenshotCreatedAt: source?.createdAt ?? null,
      uploadLabel: name ?? 'your upload',
      kind: row.kind,
      city: row.city,
      quote: reviewQuote(row.description),
      hasPin: placeHasPin(row.coords),
    }]
  }).sort(compareEntries).map((draft) => ({
    placeId: draft.placeId,
    name: draft.name,
    createdAt: draft.createdAt,
    userId: draft.userId,
    sourceId: draft.sourceId,
    screenshotUrl: draft.screenshotUrl,
    screenshotName: draft.screenshotName,
    screenshotCreatedAt: draft.screenshotCreatedAt,
    uploadLabel: draft.uploadLabel,
    kind: draft.kind,
    city: draft.city,
    quote: draft.quote,
    hasPin: draft.hasPin,
  }))
}

/**
 * Places linked to this screenshot. The source is already the caller's, and the
 * place read is scoped again so a stray cross-tenant link cannot leak a name.
 */
async function loadScreenshot(userId: string, place: PlaceWithRelations): Promise<ReviewScreenshot | null> {
  const source = rankingSource(place.sources)
  if (!source?.uri) return null
  const scoped = forUser(userId)
  const links = await scoped.selectFieldsVia(
    sourcesToPlaces,
    { placeId: sourcesToPlaces.placeId },
    eq(sourcesToPlaces.sourceId, source.id),
  )
  const placeIds = [...new Set(links.map((link) => link.placeId))]
  const rows = placeIds.length
    ? await scoped.selectFields(places, {
        id: places.id,
        name: places.name,
        status: places.status,
        createdAt: places.createdAt,
      }, inArray(places.id, placeIds))
    : []
  const siblings = rows.map((row) => ({
    placeId: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
  }))
  if (!siblings.some((sibling) => sibling.placeId === place.id)) {
    siblings.push({
      placeId: place.id,
      name: place.name,
      status: place.status,
      createdAt: place.createdAt,
    })
  }
  const extractionOrder = extractionOrderByPlaceId(
    namesFromExtraction(source.meta?.massUpload?.extraction),
    siblings.map((sibling) => ({ id: sibling.placeId, name: sibling.name, createdAt: sibling.createdAt })),
  )
  siblings.sort((a, b) => compareExtractionOrder(a, b, extractionOrder))
  return {
    sourceId: source.id,
    url: source.uri,
    name: nameFromSourceMeta(source.meta),
    createdAt: source.createdAt,
    siblings,
    softCover: isSharedScreenshotCover(place.attachments, source.uri, siblings.length),
  }
}

/** Postcard payload for one owned place. Null when the id is missing or someone else's. */
export async function loadReviewPostcard(userId: string, placeId: string): Promise<ReviewPostcard | null> {
  const place = await getPlaceWithRelations(placeId, userId)
  if (!place) return null
  const [alsoIn, screenshot] = await Promise.all([
    place.city
      ? getExplorePlacesInCity(userId, place.city, place.country, place.id)
      : Promise.resolve([]),
    loadScreenshot(userId, place),
  ])
  return { place, alsoIn, screenshot }
}

/**
 * Queue order and light rows for every inbox place, and relations plus the
 * city rail only for `visiblePlaceId` (or the first row, when that id is
 * absent or no longer inbox). `uploadSessionId` keeps the walk inside that
 * upload's inbox places.
 */
async function loadReviewTrips(userId: string): Promise<ReviewTrip[]> {
  const trips = await getExploreCollections(userId)
  const placeIds = [...new Set(trips.flatMap((trip) => trip.placeIds))]
  const scoped = forUser(userId)
  const rows = placeIds.length
    ? await scoped.selectFields(places, { id: places.id, city: places.city }, inArray(places.id, placeIds))
    : []
  const cityByPlace = new Map(rows.map((row) => [row.id, row.city]))
  return trips.map((trip) => ({
    ...trip,
    cities: trip.placeIds.flatMap((placeId) => {
      const city = cityByPlace.get(placeId)?.trim()
      return city ? [city] : []
    }),
  }))
}

export async function loadReviewQueue(
  userId: string,
  visiblePlaceId?: string,
  uploadSessionId?: string,
): Promise<ReviewQueueData> {
  const upload = uploadSessionId?.trim() || undefined
  const [entries, trips] = await Promise.all([
    loadReviewEntries(userId, upload),
    loadReviewTrips(userId),
  ])
  const visible = visiblePlaceId && entries.some((entry) => entry.placeId === visiblePlaceId)
    ? visiblePlaceId
    : entries[0]?.placeId
  const postcard = visible ? await loadReviewPostcard(userId, visible) : null
  return { entries, trips, postcard }
}
