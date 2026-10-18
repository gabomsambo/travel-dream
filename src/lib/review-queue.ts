import { getPlacesByStatus, getPlaceWithRelations } from '@/lib/db-queries'
import { getExploreCollections, getExplorePlacesInCity } from '@/lib/explore/queries'
import type { ExploreCollection, ExplorePlace } from '@/lib/explore/types'
import type { PlaceWithRelations, Source } from '@/types/database'

export interface ReviewQueueItem {
  place: PlaceWithRelations
  source: Source | null
  screenshotUrl: string | null
  screenshotName: string | null
  uploadLabel: string
  alsoIn: ExplorePlace[]
}

export interface ReviewQueueData {
  items: ReviewQueueItem[]
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

function screenshotSource(sources: Source[]): Source | null {
  const ordered = [...sources].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  )
  return ordered.find((source) => source.type === 'screenshot') ?? ordered[0] ?? null
}

/**
 * Everything the client Review queue needs, assembled only from user-scoped
 * query functions. Source time keeps places from the same screenshot together;
 * extraction order belongs to the later group-review PR because the join table
 * itself has no ordering column.
 */
export async function loadReviewQueue(userId: string): Promise<ReviewQueueData> {
  const [inboxPlaces, trips] = await Promise.all([
    getPlacesByStatus('inbox', userId),
    getExploreCollections(userId),
  ])

  const loaded = await Promise.all(inboxPlaces.map(async (row): Promise<ReviewQueueItem | null> => {
    const place = await getPlaceWithRelations(row.id, userId)
    if (!place) return null

    const source = screenshotSource(place.sources)
    const alsoIn = place.city
      ? await getExplorePlacesInCity(userId, place.city, place.country, place.id)
      : []
    const name = sourceName(source)

    return {
      place,
      source,
      screenshotUrl: source?.uri ?? null,
      screenshotName: name,
      uploadLabel: name ?? 'your upload',
      alsoIn,
    }
  }))

  const items = loaded
    .filter((item): item is ReviewQueueItem => item !== null)
    .sort((a, b) => {
      const bySourceTime = sourceTime(b.source).localeCompare(sourceTime(a.source))
      if (bySourceTime !== 0) return bySourceTime
      const bySource = (a.source?.id ?? '').localeCompare(b.source?.id ?? '')
      if (bySource !== 0) return bySource
      const byPlaceTime = a.place.createdAt.localeCompare(b.place.createdAt)
      return byPlaceTime || a.place.id.localeCompare(b.place.id)
    })

  return { items, trips }
}
