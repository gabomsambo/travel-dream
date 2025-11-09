import { Suspense } from "react"
import { LibraryClient } from "@/components/library/library-client"
import { LibraryStatsCards } from "@/components/library/library-stats-cards"
import { searchPlaces, getLibraryStatsEnhanced } from "@/lib/db-queries"
import { getCoverImagesForPlaces, type PlaceWithCover } from "@/lib/library-adapters"
import type { Place } from "@/types/database"

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

  // Fetch all library places
  const places = await searchPlaces({
    status: 'library',
    text: filters.search || undefined,
    kind: filters.kind !== 'all' ? filters.kind : undefined,
    city: filters.city !== 'all' ? filters.city : undefined,
    country: filters.country !== 'all' ? filters.country : undefined,
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    vibes: filters.vibes.length > 0 ? filters.vibes : undefined
  })

  // Fetch cover images for all places
  const placeIds = places.map(p => p.id)
  const coverMap = await getCoverImagesForPlaces(placeIds)

  // Adapt places with cover URLs
  const placesWithCovers: PlaceWithCover[] = places.map(place => ({
    ...place,
    coverUrl: coverMap.get(place.id)
  }))

  // Fetch library stats
  const stats = await getLibraryStatsEnhanced()

  // Compute dynamic filter options from actual library data
  const filterOptions = {
    kinds: [...new Set(places.map(p => p.kind))].sort(),
    cities: [...new Set(places.map(p => p.city).filter(Boolean) as string[])].sort(),
    countries: [...new Set(places.map(p => p.country).filter(Boolean) as string[])].sort(),
    tags: [...new Set(places.flatMap(p => p.tags || []))].sort(),
    vibes: [...new Set(places.flatMap(p => p.vibes || []))].sort()
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
