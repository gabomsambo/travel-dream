"use client"

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PlaceGrid } from "@/components/places/place-grid"
import { PlaceDetailsDialog } from "@/components/places/place-details-dialog"
import { LibraryFilters } from "./library-filters"
import { LibraryStats } from "./library-stats"
import { useDebounce } from "@/hooks/use-debounce"
import type { Place } from "@/types/database"

interface LibraryClientProps {
  initialPlaces: Place[]
  filterOptions: {
    kinds: string[]
    cities: string[]
    countries: string[]
    tags: string[]
    vibes: string[]
  }
}

export function LibraryClient({ initialPlaces, filterOptions }: LibraryClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Initialize filter state from URL params
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [kind, setKind] = useState(searchParams.get('kind') || 'all')
  const [city, setCity] = useState(searchParams.get('city') || 'all')
  const [country, setCountry] = useState(searchParams.get('country') || 'all')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(searchParams.get('tags')?.split(',').filter(Boolean) || [])
  )
  const [selectedVibes, setSelectedVibes] = useState<Set<string>>(
    new Set(searchParams.get('vibes')?.split(',').filter(Boolean) || [])
  )
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)

  // Debounce search for URL updates
  const debouncedSearch = useDebounce(search, 300)

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    // Only set non-default values
    if (debouncedSearch) {
      params.set('search', debouncedSearch)
    } else {
      params.delete('search')
    }

    if (kind !== 'all') {
      params.set('kind', kind)
    } else {
      params.delete('kind')
    }

    if (city !== 'all') {
      params.set('city', city)
    } else {
      params.delete('city')
    }

    if (country !== 'all') {
      params.set('country', country)
    } else {
      params.delete('country')
    }

    if (selectedTags.size > 0) {
      params.set('tags', Array.from(selectedTags).join(','))
    } else {
      params.delete('tags')
    }

    if (selectedVibes.size > 0) {
      params.set('vibes', Array.from(selectedVibes).join(','))
    } else {
      params.delete('vibes')
    }

    // Preserve pathname and update only params
    const queryString = params.toString()
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname
    router.push(newUrl)
  }, [debouncedSearch, kind, city, country, selectedTags, selectedVibes, pathname, router, searchParams])

  // Client-side filtering with useMemo
  const filteredPlaces = useMemo(() => {
    let result = initialPlaces

    // Text search in name and notes
    if (search) {
      const query = search.toLowerCase()
      result = result.filter(place =>
        place.name.toLowerCase().includes(query) ||
        place.notes?.toLowerCase().includes(query)
      )
    }

    // Kind filter
    if (kind !== 'all') {
      result = result.filter(place => place.kind === kind)
    }

    // City filter
    if (city !== 'all') {
      result = result.filter(place => place.city === city)
    }

    // Country filter
    if (country !== 'all') {
      result = result.filter(place => place.country === country)
    }

    // Tag filter (client-side for better UX)
    if (selectedTags.size > 0) {
      result = result.filter(place =>
        Array.from(selectedTags).some(tag => place.tags?.includes(tag))
      )
    }

    // Vibe filter (client-side for better UX)
    if (selectedVibes.size > 0) {
      result = result.filter(place =>
        Array.from(selectedVibes).some(vibe => place.vibes?.includes(vibe))
      )
    }

    return result
  }, [initialPlaces, search, kind, city, country, selectedTags, selectedVibes])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearch('')
    setKind('all')
    setCity('all')
    setCountry('all')
    setSelectedTags(new Set())
    setSelectedVibes(new Set())
    router.push('/library')
  }, [router])

  // Handle filter changes
  const handleFilterChange = useCallback((updates: {
    search?: string
    kind?: string
    city?: string
    country?: string
    tags?: Set<string>
    vibes?: Set<string>
  }) => {
    if ('search' in updates) setSearch(updates.search!)
    if ('kind' in updates) setKind(updates.kind!)
    if ('city' in updates) setCity(updates.city!)
    if ('country' in updates) setCountry(updates.country!)
    if ('tags' in updates) setSelectedTags(updates.tags!)
    if ('vibes' in updates) setSelectedVibes(updates.vibes!)
  }, [])

  // Handle view place
  const handleViewPlace = useCallback((placeId: string) => {
    const place = filteredPlaces.find(p => p.id === placeId)
    setSelectedPlace(place || null)
  }, [filteredPlaces])

  return (
    <div className="space-y-6">
      <LibraryFilters
        filters={{
          search,
          kind,
          city,
          country,
          tags: selectedTags,
          vibes: selectedVibes
        }}
        filterOptions={filterOptions}
        onFilterChange={handleFilterChange}
        onClearFilters={clearFilters}
      />

      <LibraryStats
        totalCount={initialPlaces.length}
        filteredCount={filteredPlaces.length}
      />

      {filteredPlaces.length > 0 ? (
        <PlaceGrid
          places={filteredPlaces}
          showActions={false}
          showConfidence={false}
          onView={handleViewPlace}
          virtualizeThreshold={500}
          enablePerformanceMonitoring={process.env.NODE_ENV === 'development'}
          emptyMessage="No places match your filters"
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-3 mb-4">
            <svg
              className="h-6 w-6 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1">No places found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Try adjusting your filters to find more places
          </p>
        </div>
      )}

      <PlaceDetailsDialog
        open={selectedPlace !== null}
        onOpenChange={(open) => !open && setSelectedPlace(null)}
        place={selectedPlace}
      />
    </div>
  )
}
