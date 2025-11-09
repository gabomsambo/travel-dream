"use client"

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Library } from 'lucide-react'
import { PlaceGrid } from "@/components/places/place-grid"
import { PlaceDetailsDialogEnhanced } from "@/components/places/place-details-dialog-enhanced"
import { PlaceCardV2 } from "@/components/library-v2/place-card-v2"
import { PlaceFiltersSidebar } from "@/components/library-v2/place-filters-sidebar"
import { EmptyState } from "@/components/library-v2/empty-state"
import { LibraryStats } from "./library-stats"
import { LibraryViewSwitcher } from "./library-view-switcher"
import { LibrarySortControls } from "./library-sort-controls"
import { ActiveFilterChips } from "./active-filter-chips"
import { PlaceListView } from "./place-list-view"
import { PlaceMapView } from "./place-map-view"
import { useDebounce } from "@/hooks/use-debounce"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { UserPreferences, DEFAULT_PREFERENCES } from "@/types/user-preferences"
import type { PlaceWithCover } from "@/lib/library-adapters"
import type { Place } from "@/types/database"

interface LibraryClientProps {
  initialPlaces: PlaceWithCover[]
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
  const [preferences] = useLocalStorage<UserPreferences>('user-preferences', DEFAULT_PREFERENCES)

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
  const [rating, setRating] = useState(parseInt(searchParams.get('rating') || '0'))
  const [visitStatus, setVisitStatus] = useState<Set<string>>(
    new Set(searchParams.get('visitStatus')?.split(',').filter(Boolean) || [])
  )
  const [hasPhotosOnly, setHasPhotosOnly] = useState(
    searchParams.get('hasPhotosOnly') === 'true'
  )
  const [view, setView] = useState<'grid' | 'list' | 'map'>(
    (searchParams.get('view') as 'grid' | 'list' | 'map') || preferences.defaultView
  )
  const [sort, setSort] = useState(searchParams.get('sort') || 'date-newest')
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

    if (rating > 0) {
      params.set('rating', rating.toString())
    } else {
      params.delete('rating')
    }

    if (visitStatus.size > 0) {
      params.set('visitStatus', Array.from(visitStatus).join(','))
    } else {
      params.delete('visitStatus')
    }

    if (hasPhotosOnly) {
      params.set('hasPhotosOnly', 'true')
    } else {
      params.delete('hasPhotosOnly')
    }

    if (view !== 'grid') {
      params.set('view', view)
    } else {
      params.delete('view')
    }

    if (sort !== 'date-newest') {
      params.set('sort', sort)
    } else {
      params.delete('sort')
    }

    // Preserve pathname and update only params
    const queryString = params.toString()
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname
    router.push(newUrl)
  }, [debouncedSearch, kind, city, country, selectedTags, selectedVibes, rating,
      visitStatus, hasPhotosOnly, view, sort, pathname, router, searchParams])

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

    // Rating filter
    if (rating > 0) {
      result = result.filter(place => (place.ratingSelf || 0) >= rating)
    }

    // Visit status filter
    if (visitStatus.size > 0) {
      result = result.filter(place =>
        visitStatus.has(place.visitStatus || 'not_visited')
      )
    }

    // Has photos filter
    // Note: This requires fetching attachment count from the database
    // For now, we'll keep this filter in the UI but it won't filter anything
    // TODO: Update the server query to include attachment counts
    if (hasPhotosOnly) {
      // Placeholder: In a future update, this should filter based on attachment count
      // result = result.filter(place => place.attachmentCount > 0)
    }

    return result
  }, [initialPlaces, search, kind, city, country, selectedTags, selectedVibes,
      rating, visitStatus, hasPhotosOnly])

  // Sorting logic
  const sortedPlaces = useMemo(() => {
    const places = [...filteredPlaces]

    switch (sort) {
      case 'date-newest':
        return places.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      case 'date-oldest':
        return places.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      case 'rating-high':
        return places.sort((a, b) =>
          (b.ratingSelf || 0) - (a.ratingSelf || 0)
        )
      case 'rating-low':
        return places.sort((a, b) =>
          (a.ratingSelf || 0) - (b.ratingSelf || 0)
        )
      case 'name-az':
        return places.sort((a, b) => a.name.localeCompare(b.name))
      case 'name-za':
        return places.sort((a, b) => b.name.localeCompare(a.name))
      case 'kind':
        return places.sort((a, b) => a.kind.localeCompare(b.kind))
      default:
        return places
    }
  }, [filteredPlaces, sort])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearch('')
    setKind('all')
    setCity('all')
    setCountry('all')
    setSelectedTags(new Set())
    setSelectedVibes(new Set())
    setRating(0)
    setVisitStatus(new Set())
    setHasPhotosOnly(false)
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
    rating?: number
    visitStatus?: Set<string>
    hasPhotosOnly?: boolean
  }) => {
    if ('search' in updates) setSearch(updates.search!)
    if ('kind' in updates) setKind(updates.kind!)
    if ('city' in updates) setCity(updates.city!)
    if ('country' in updates) setCountry(updates.country!)
    if ('tags' in updates) setSelectedTags(updates.tags!)
    if ('vibes' in updates) setSelectedVibes(updates.vibes!)
    if ('rating' in updates) setRating(updates.rating!)
    if ('visitStatus' in updates) setVisitStatus(updates.visitStatus!)
    if ('hasPhotosOnly' in updates) setHasPhotosOnly(updates.hasPhotosOnly!)
  }, [])

  // Handle filter chip removal
  const handleRemoveFilter = useCallback((key: string) => {
    switch (key) {
      case 'search':
        setSearch('')
        break
      case 'kind':
        setKind('all')
        break
      case 'city':
        setCity('all')
        break
      case 'country':
        setCountry('all')
        break
      case 'tags':
        setSelectedTags(new Set())
        break
      case 'vibes':
        setSelectedVibes(new Set())
        break
      case 'rating':
        setRating(0)
        break
      case 'visitStatus':
        setVisitStatus(new Set())
        break
      case 'hasPhotosOnly':
        setHasPhotosOnly(false)
        break
    }
  }, [])

  // Handle view place (for grid view which uses place ID)
  const handleViewPlace = useCallback((placeId: string) => {
    const place = filteredPlaces.find(p => p.id === placeId)
    setSelectedPlace(place || null)
  }, [filteredPlaces])

  // Handle view place (for list/map views which use place object)
  const handleViewPlaceObject = useCallback((place: Place) => {
    setSelectedPlace(place)
  }, [])

  // Handle delete place
  const handleDeletePlace = useCallback(async (placeId: string) => {
    const place = initialPlaces.find(p => p.id === placeId)
    const placeName = place?.name || 'this place'

    if (!confirm(`Are you sure you want to permanently delete "${placeName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/places/${placeId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete place')
      }

      window.location.reload()
    } catch (error) {
      alert('Failed to delete place. Please try again.')
      console.error('Delete error:', error)
    }
  }, [initialPlaces])

  // Convert kind filter to Set for sidebar compatibility
  const selectedKinds = useMemo(() => {
    return kind !== 'all' ? new Set([kind]) : new Set<string>()
  }, [kind])

  const handleSidebarFilterChange = useCallback((updates: {
    kinds?: Set<string>
    vibes?: Set<string>
    rating?: number
    visitStatus?: Set<string>
    hasPhotosOnly?: boolean
  }) => {
    if ('kinds' in updates) {
      // Convert Set back to single kind for URL
      const kindsArray = Array.from(updates.kinds!)
      setKind(kindsArray.length === 1 ? kindsArray[0] : 'all')
    }
    if ('vibes' in updates) setSelectedVibes(updates.vibes!)
    if ('rating' in updates) setRating(updates.rating!)
    if ('visitStatus' in updates) setVisitStatus(updates.visitStatus!)
    if ('hasPhotosOnly' in updates) setHasPhotosOnly(updates.hasPhotosOnly!)
  }, [])

  return (
    <div className="flex gap-6">
      {/* Desktop Filters Sidebar */}
      <aside className="hidden lg:block shrink-0">
        <PlaceFiltersSidebar
          filters={{
            kinds: selectedKinds,
            vibes: selectedVibes,
            tags: selectedTags,
            rating,
            visitStatus,
            hasPhotosOnly
          }}
          filterOptions={filterOptions}
          onChange={handleSidebarFilterChange}
          onClear={clearFilters}
        />
      </aside>

      {/* Main Content */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Mobile Filters */}
        <div className="lg:hidden">
          <PlaceFiltersSidebar
            filters={{
              kinds: selectedKinds,
              vibes: selectedVibes,
              tags: selectedTags,
              rating,
              visitStatus,
              hasPhotosOnly
            }}
            filterOptions={filterOptions}
            onChange={handleSidebarFilterChange}
            onClear={clearFilters}
          />
        </div>

        <ActiveFilterChips
          filters={{
            search,
            kind: kind !== 'all' ? kind : undefined,
            city: city !== 'all' ? city : undefined,
            country: country !== 'all' ? country : undefined,
            tags: selectedTags,
            vibes: selectedVibes,
            rating: rating > 0 ? rating : undefined,
            visitStatus,
            hasPhotosOnly: hasPhotosOnly ? true : undefined
          }}
          onRemoveFilter={handleRemoveFilter}
        />

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <LibraryStats
            totalCount={initialPlaces.length}
            filteredCount={filteredPlaces.length}
          />
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <LibrarySortControls
              sort={sort}
              onSortChange={setSort}
            />
            <LibraryViewSwitcher
              view={view}
              onViewChange={setView}
            />
          </div>
        </div>

        {sortedPlaces.length > 0 ? (
          <>
            {view === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {sortedPlaces.map((place) => (
                  <PlaceCardV2
                    key={place.id}
                    place={place}
                    onClick={() => setSelectedPlace(place)}
                  />
                ))}
              </div>
            )}
            {view === 'list' && (
              <PlaceListView
                places={sortedPlaces}
                onView={handleViewPlaceObject}
                onDelete={handleDeletePlace}
              />
            )}
            {view === 'map' && (
              <PlaceMapView
                places={sortedPlaces}
                onView={handleViewPlaceObject}
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={Library}
            title="No places found"
            description="Try adjusting your filters or add new places to your library"
            action={{
              label: "Clear Filters",
              onClick: clearFilters
            }}
          />
        )}

        <PlaceDetailsDialogEnhanced
          open={selectedPlace !== null}
          onOpenChange={(open) => !open && setSelectedPlace(null)}
          placeId={selectedPlace?.id || null}
        />
      </div>
    </div>
  )
}
