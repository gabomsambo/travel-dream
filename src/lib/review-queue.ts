import { eq, inArray, sql } from 'drizzle-orm'
import { places, sources, sourcesToPlaces } from '@/db/schema'
import { coverPhoto } from '@/lib/cover-photo'
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
  sessionId: string | null
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
  trips: ExploreCollection[]
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function sourceName(source: QueueSource | null): string | null {
  if (!source) return null
  return source.originalName ?? source.uploadFilename ?? source.filename ?? null
}

interface ScreenshotCandidate {
  id: string
  type: string
  createdAt: string
  sessionId?: string | null
}

function screenshotSource<T extends ScreenshotCandidate>(
  placeSources: T[],
  uploadSessionId?: string,
): T | null {
  const pool = uploadSessionId
    ? placeSources.filter((source) => source.sessionId === uploadSessionId)
    : placeSources
  const ordered = [...pool].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  )
  return ordered.find((source) => source.type === 'screenshot') ?? ordered[0] ?? null
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

function compareSiblings(a: ReviewScreenshotSibling, b: ReviewScreenshotSibling): number {
  return a.createdAt.localeCompare(b.createdAt) || a.placeId.localeCompare(b.placeId)
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
async function loadReviewEntries(userId: string, uploadSessionId?: string): Promise<ReviewQueueEntry[]> {
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
        sessionId: sql<string | null>`json_extract(${sources.meta}, '$.uploadInfo.sessionId')`,
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
  } satisfies QueueSource]))
  const sourcesByPlace = new Map<string, QueueSource[]>()
  for (const link of links) {
    const source = sourcesById.get(link.sourceId)
    if (!source) continue
    const list = sourcesByPlace.get(link.placeId) ?? []
    list.push(source)
    sourcesByPlace.set(link.placeId, list)
  }

  return inbox.flatMap((row) => {
    const placeSources = sourcesByPlace.get(row.id) ?? []
    if (uploadSessionId && !placeSources.some((source) => source.sessionId === uploadSessionId)) return []
    const source = screenshotSource(placeSources, uploadSessionId)
    const name = sourceName(source)
    return [{
      placeId: row.id,
      name: row.name,
      createdAt: row.createdAt,
      userId: row.userId,
      sourceCreatedAt: source?.createdAt ?? '',
      sourceId: source?.id ?? '',
      screenshotUrl: source?.uri ?? null,
      screenshotName: name,
      uploadLabel: name ?? 'your upload',
    }]
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

/**
 * Places linked to this screenshot. The source is already the caller's, and the
 * place read is scoped again so a stray cross-tenant link cannot leak a name.
 */
async function loadScreenshot(userId: string, place: PlaceWithRelations): Promise<ReviewScreenshot | null> {
  const source = screenshotSource(place.sources)
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
  siblings.sort(compareSiblings)
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
export async function loadReviewQueue(
  userId: string,
  visiblePlaceId?: string,
  uploadSessionId?: string,
): Promise<ReviewQueueData> {
  const upload = uploadSessionId?.trim() || undefined
  const [entries, trips] = await Promise.all([
    loadReviewEntries(userId, upload),
    getExploreCollections(userId),
  ])
  const visible = visiblePlaceId && entries.some((entry) => entry.placeId === visiblePlaceId)
    ? visiblePlaceId
    : entries[0]?.placeId
  const postcard = visible ? await loadReviewPostcard(userId, visible) : null
  return { entries, trips, postcard }
}
