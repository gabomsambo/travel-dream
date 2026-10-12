import { getArchivedTripMemberships, searchLibraryPlaces } from '@/lib/db-queries'
import { getCoverImagesForPlaces } from '@/lib/library-adapters'
import type { ArchivePlace, ArchiveTrip } from './view'

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Every archived place for one user, with a cover and the trips that still
 * hold it. `searchLibraryPlaces` and the cover query are each scoped to
 * `userId`; trip memberships filter both the collection and the place.
 */
export async function loadArchive(userId: string): Promise<ArchivePlace[]> {
  const [rows, memberships] = await Promise.all([
    searchLibraryPlaces({ userId, status: 'archived' }),
    getArchivedTripMemberships(userId),
  ])

  const covers = await getCoverImagesForPlaces(rows.map((r) => r.id), userId)

  const trips = new Map<string, ArchiveTrip[]>()
  for (const row of memberships) {
    const list = trips.get(row.placeId) ?? []
    list.push({ id: row.collectionId, name: row.name })
    trips.set(row.placeId, list)
  }
  for (const list of trips.values()) list.sort((a, b) => a.name.localeCompare(b.name))

  return rows.map((row) => {
    const cover = covers.get(row.id)
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      city: row.city,
      country: row.country,
      description: row.description,
      notes: row.notes,
      tags: strings(row.tags),
      vibes: strings(row.vibes),
      ratingSelf: row.ratingSelf ?? 0,
      visitStatus: row.visitStatus || 'not_visited',
      priceLevel: row.price_level,
      coverUrl: cover?.uri ?? null,
      coverAttribution: cover?.attribution ?? null,
      coverSource: cover?.source ?? null,
      createdAt: row.createdAt,
      archivedAt: row.archivedAt,
      trips: trips.get(row.id) ?? [],
      status: 'archived',
    }
  })
}
