import { Suspense } from "react"
import { LibraryClient } from "@/components/library/library-client"
import { LibraryStatsCards } from "@/components/library/library-stats-cards"
import { searchLibraryPlaces, getLibraryStatsEnhanced } from "@/lib/db-queries"
import { getCoverImagesForPlaces, type LibraryPlaceWithCover } from "@/lib/library-adapters"
import { auth } from "@/lib/auth"

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function LibraryFiltersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="h-10 bg-muted animate-pulse rounded-md flex-1" />
          <div className="h-10 bg-muted animate-pulse rounded-md w-full sm:w-40" />
          <div className="h-10 bg-muted animate-pulse rounded-md w-full sm:w-40" />
          <div className="h-10 bg-muted animate-pulse rounded-md w-full sm:w-40" />
        </div>
      </div>
      <div className="h-6 bg-muted animate-pulse rounded-md w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default async function LibraryPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }
  const userId = session.user.id

  // Next.js 15: searchParams is a Promise
  const params = await searchParams

  // Parse filters from URL
  const filters = {
    search: (params.search as string) || '',
    kind: (params.kind as string) || 'all',
    city: (params.city as string) || 'all',
    country: (params.country as string) || 'all',
    tags: (params.tags as string)?.split(',').filter(Boolean) || [],
    vibes: (params.vibes as string)?.split(',').filter(Boolean) || []
  }

  // Two independent queries in parallel — places list and aggregate stats.
  const [places, stats] = await Promise.all([
    searchLibraryPlaces({ userId, status: 'library' }),
    getLibraryStatsEnhanced(userId),
  ])

  // Single follow-up await — depends on placeIds from `places`.
  const coverMap = await getCoverImagesForPlaces(places.map(p => p.id))

  // Omit the coverUrl key entirely when no cover exists, to keep the RSC payload tight.
  const placesWithCovers: LibraryPlaceWithCover[] = places.map(place =>
    coverMap.has(place.id)
      ? { ...place, coverUrl: coverMap.get(place.id)! }
      : { ...place }
  )

  // Compute dynamic filter options from actual library data
  const filterOptions = {
    kinds: [...new Set(places.map(p => p.kind))].sort(),
    cities: [...new Set(places.map(p => p.city).filter(Boolean) as string[])].sort(),
    countries: [...new Set(places.map(p => p.country).filter(Boolean) as string[])].sort(),
    tags: [...new Set(places.flatMap(p => Array.isArray(p.tags) ? p.tags : []))].sort(),
    vibes: [...new Set(places.flatMap(p => Array.isArray(p.vibes) ? p.vibes : []))].sort()
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground mt-1">
          Your curated collection of confirmed travel places
        </p>
      </div>

      <LibraryStatsCards stats={stats} />

      <Suspense fallback={<LibraryFiltersSkeleton />}>
        <LibraryClient
          initialPlaces={placesWithCovers}
          filterOptions={filterOptions}
        />
      </Suspense>
    </div>
  )
}
