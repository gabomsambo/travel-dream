"use client"

import { useState, useEffect, useMemo, useOptimistic, useCallback, startTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw, Trash2, Loader2, Archive as ArchiveIcon } from 'lucide-react'
import { PlaceDetailsDialogEnhanced } from "@/components/places/place-details-dialog-enhanced"
import { PlaceCardV2 } from "@/components/library-v2/place-card-v2"
import { Checkbox } from "@/components/ui/checkbox"
import { PlaceFiltersSidebar } from "@/components/library-v2/place-filters-sidebar"
import { EmptyState } from "@/components/library-v2/empty-state"
import { PlaceListView } from "@/components/library/place-list-view"
import { PlaceMapView } from "@/components/library/place-map-view"
import { LibraryViewSwitcher } from "@/components/library/library-view-switcher"
import { LibrarySortControls } from "@/components/library/library-sort-controls"
import { ActiveFilterChips } from "@/components/library/active-filter-chips"
import { LibrarySearchBar } from "@/components/library/library-search-bar"
import { ArchiveToolbar } from "./archive-toolbar"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Button } from "@/components/adapters/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/hooks/use-debounce"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { UserPreferences, DEFAULT_PREFERENCES } from "@/types/user-preferences"
import type { PlaceWithCover } from "@/lib/library-adapters"
import type { Place } from "@/types/database"
import { initializeSearchIndex, fuzzySearch } from "@/lib/search-service"
import type { ExportFormat } from "@/types/export"

interface ArchiveClientProps {
  initialPlaces: PlaceWithCover[]
  filterOptions: {
    kinds: string[]
    cities: string[]
    countries: string[]
    tags: string[]
    vibes: string[]
  }
}

type OptimisticAction =
  | { type: 'restore'; placeIds: string[] }
  | { type: 'delete'; placeIds: string[] }

function optimisticReducer(state: PlaceWithCover[], action: OptimisticAction): PlaceWithCover[] {
  switch (action.type) {
    case 'restore':
      return state.filter(place => !action.placeIds.includes(place.id))
    case 'delete':
      return state.filter(place => !action.placeIds.includes(place.id))
    default:
      return state
  }
}

export function ArchiveClient({ initialPlaces, filterOptions }: ArchiveClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [preferences] = useLocalStorage<UserPreferences>('user-preferences', DEFAULT_PREFERENCES)

  const [places, setOptimisticPlaces] = useOptimistic(initialPlaces, optimisticReducer)

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(
    new Set(searchParams.get('kind')?.split(',').filter(Boolean) || [])
  )
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

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showKeyboardHints, setShowKeyboardHints] = useState(false)

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    initializeSearchIndex(places)
  }, [places])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (debouncedSearch) {
      params.set('search', debouncedSearch)
    } else {
      params.delete('search')
    }

    if (selectedKinds.size > 0) {
      params.set('kind', Array.from(selectedKinds).join(','))
    } else {
      params.delete('kind')
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

    if (view !== preferences.defaultView) {
      params.set('view', view)
    } else {
      params.delete('view')
    }

    if (sort !== 'date-newest') {
      params.set('sort', sort)
    } else {
      params.delete('sort')
    }

    const queryString = params.toString()
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname
    router.push(newUrl)
  }, [debouncedSearch, selectedKinds, selectedTags, selectedVibes, rating,
      visitStatus, hasPhotosOnly, view, sort, pathname, router, searchParams, preferences.defaultView])

  const filteredPlaces = useMemo(() => {
    let result = places

    if (search) {
      const searchResults = fuzzySearch(search)
      const searchPlaceIds = new Set(searchResults.map(r => r.place.id))
      result = result.filter(place => searchPlaceIds.has(place.id))
    }

    if (selectedKinds.size > 0) {
      result = result.filter(place => selectedKinds.has(place.kind))
    }

    if (selectedTags.size > 0) {
      result = result.filter(place =>
        Array.from(selectedTags).some(tag => place.tags?.includes(tag))
      )
    }

    if (selectedVibes.size > 0) {
      result = result.filter(place =>
        Array.from(selectedVibes).some(vibe => place.vibes?.includes(vibe))
      )
    }

    if (rating > 0) {
      result = result.filter(place => (place.ratingSelf || 0) >= rating)
    }

    if (visitStatus.size > 0) {
      result = result.filter(place =>
        visitStatus.has(place.visitStatus || 'not_visited')
      )
    }

    return result
  }, [places, search, selectedKinds, selectedTags, selectedVibes, rating, visitStatus, hasPhotosOnly])

  const sortedPlaces = useMemo(() => {
    const placesToSort = [...filteredPlaces]

    switch (sort) {
      case 'date-newest':
        return placesToSort.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      case 'date-oldest':
        return placesToSort.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      case 'rating-high':
        return placesToSort.sort((a, b) =>
          (b.ratingSelf || 0) - (a.ratingSelf || 0)
        )
      case 'rating-low':
        return placesToSort.sort((a, b) =>
          (a.ratingSelf || 0) - (b.ratingSelf || 0)
        )
      case 'name-az':
        return placesToSort.sort((a, b) => a.name.localeCompare(b.name))
      case 'name-za':
        return placesToSort.sort((a, b) => b.name.localeCompare(a.name))
      case 'kind':
        return placesToSort.sort((a, b) => a.kind.localeCompare(b.kind))
      default:
        return placesToSort
    }
  }, [filteredPlaces, sort])

  const clearAllFilters = useCallback(() => {
    setSearch('')
    setSelectedKinds(new Set())
    setSelectedTags(new Set())
    setSelectedVibes(new Set())
    setRating(0)
    setVisitStatus(new Set())
    setHasPhotosOnly(false)
  }, [])

  const handleSidebarFilterChange = useCallback((updates: Partial<{
    kinds: Set<string>
    vibes: Set<string>
    tags: Set<string>
    rating: number
    visitStatus: Set<string>
    hasPhotosOnly: boolean
  }>) => {
    if (updates.kinds !== undefined) setSelectedKinds(updates.kinds)
    if (updates.vibes !== undefined) setSelectedVibes(updates.vibes)
    if (updates.tags !== undefined) setSelectedTags(updates.tags)
    if (updates.rating !== undefined) setRating(updates.rating)
    if (updates.visitStatus !== undefined) setVisitStatus(updates.visitStatus)
    if (updates.hasPhotosOnly !== undefined) setHasPhotosOnly(updates.hasPhotosOnly)
  }, [])

  const toggleSelection = useCallback((placeId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(placeId)) {
        newSet.delete(placeId)
      } else {
        newSet.add(placeId)
      }
      return newSet
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(sortedPlaces.map(p => p.id)))
  }, [sortedPlaces])

  const selectNone = useCallback(() => {
    setSelectedItems(new Set())
  }, [])

  const restorePlaces = useCallback(async (placeIds: string[]) => {
    setIsLoading(true)
    setRestoreDialogOpen(false)

    startTransition(() => {
      setOptimisticPlaces({ type: 'restore', placeIds })
    })

    try {
      const response = await fetch('/api/places/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', placeIds })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to restore places')
      }

      const result = await response.json()
      toast.success(`Restored ${result.result?.updatedCount || placeIds.length} place(s) to library`)

      selectNone()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore places')
      console.error('Error restoring places:', error)
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [router, selectNone])

  const deletePlaces = useCallback(async (placeIds: string[]) => {
    setIsDeleting(true)

    try {
      const response = await fetch('/api/places/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', placeIds })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to delete places')
      }

      const result = await response.json()
      toast.success(`Permanently deleted ${result.result?.updatedCount || placeIds.length} place(s)`)

      setDeleteDialogOpen(false)
      setConfirmText('')
      selectNone()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete places')
      console.error('Error deleting places:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [router, selectNone])

  const handleRestoreClick = useCallback(() => {
    if (selectedItems.size === 0) {
      toast.error('No places selected')
      return
    }
    setRestoreDialogOpen(true)
  }, [selectedItems.size])

  const handleDeleteClick = useCallback(() => {
    if (selectedItems.size === 0) {
      toast.error('No places selected')
      return
    }
    setDeleteDialogOpen(true)
  }, [selectedItems.size])

  const exportPlaces = useCallback(async (format: ExportFormat) => {
    if (selectedItems.size === 0) {
      toast.error('No places selected for export')
      return
    }

    setIsExporting(true)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: {
            type: 'selected',
            placeIds: Array.from(selectedItems)
          },
          format,
          preset: 'standard'
        })
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `archive_export.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success(`Exported ${selectedItems.size} place(s)`)
    } catch (error) {
      toast.error('Failed to export places')
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }, [selectedItems])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        handleRestoreClick()
      } else if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        handleDeleteClick()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleRestoreClick, handleDeleteClick])

  const isAllSelected = selectedItems.size === sortedPlaces.length && sortedPlaces.length > 0
  const isSomeSelected = selectedItems.size > 0 && selectedItems.size < sortedPlaces.length

  return (
    <div className="space-y-6">
      <ArchiveToolbar
        selectedCount={selectedItems.size}
        totalCount={sortedPlaces.length}
        isAllSelected={isAllSelected}
        isSomeSelected={isSomeSelected}
        onRestoreSelected={handleRestoreClick}
        onDeleteSelected={handleDeleteClick}
        onExportSelected={exportPlaces}
        onSelectAll={selectAll}
        onSelectNone={selectNone}
        isExporting={isExporting}
        showKeyboardHints={showKeyboardHints}
        onToggleKeyboardHints={() => setShowKeyboardHints(!showKeyboardHints)}
        disabled={isLoading}
        loading={isLoading}
      />

      <div className="flex flex-col gap-4">
        <LibrarySearchBar
          value={search}
          onChange={setSearch}
        />

        <div className="flex items-center justify-between gap-4">
          <ActiveFilterChips
            filters={{
              search,
              kinds: selectedKinds,
              tags: selectedTags,
              vibes: selectedVibes,
              rating: rating > 0 ? rating : undefined,
              visitStatus,
              hasPhotosOnly: hasPhotosOnly ? true : undefined
            }}
            onRemoveFilter={(key) => {
              switch (key) {
                case 'search':
                  setSearch('')
                  break
                case 'kinds':
                  setSelectedKinds(new Set())
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
            }}
          />

          <div className="flex items-center gap-2">
            <LibrarySortControls sort={sort} onSortChange={setSort} />
            <LibraryViewSwitcher view={view} onViewChange={setView} />
          </div>
        </div>
      </div>

      <div className="flex gap-6">
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
          onClear={clearAllFilters}
        />

        <div className="flex-1">
          {sortedPlaces.length === 0 ? (
            <EmptyState
              icon={ArchiveIcon}
              title="No archived places"
              description={search || selectedKinds.size > 0 || selectedTags.size > 0 || selectedVibes.size > 0
                ? "No places match your current filters. Try adjusting your search criteria."
                : "You haven't archived any places yet. Archived places will appear here."}
            />
          ) : (
            <>
              {view === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {sortedPlaces.map((place) => (
                    <div key={place.id} className="relative">
                      <div className="absolute top-2 left-2 z-10">
                        <Checkbox
                          checked={selectedItems.has(place.id)}
                          onCheckedChange={() => toggleSelection(place.id)}
                          className="bg-white border-2 shadow-sm"
                        />
                      </div>
                      <PlaceCardV2
                        place={place}
                        onClick={() => toggleSelection(place.id)}
                        className={selectedItems.has(place.id) ? 'ring-2 ring-primary' : ''}
                      />
                    </div>
                  ))}
                </div>
              )}

              {view === 'list' && (
                <PlaceListView
                  places={sortedPlaces}
                  onView={setSelectedPlace}
                />
              )}

              {view === 'map' && (
                <PlaceMapView
                  places={sortedPlaces}
                  onView={setSelectedPlace}
                />
              )}
            </>
          )}
        </div>
      </div>

      <PlaceDetailsDialogEnhanced
        open={selectedPlace !== null}
        onOpenChange={(open) => !open && setSelectedPlace(null)}
        place={selectedPlace || undefined}
      />

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {selectedItems.size} Place(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the selected places back to your library. You can archive them again later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <Button
              onClick={() => restorePlaces(Array.from(selectedItems))}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore to Library
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Permanently Delete {selectedItems.size} Place(s)?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-destructive">This action cannot be undone.</p>
              <p>These places will be completely removed from the database, including all associated data.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="my-4">
            <Label htmlFor="confirm-text">Type "confirm" to proceed:</Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="confirm"
              autoFocus
              disabled={isDeleting}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deletePlaces(Array.from(selectedItems))}
              disabled={confirmText.toLowerCase() !== 'confirm' || isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ArchiveClient
