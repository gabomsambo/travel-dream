"use client"

import { useState, useEffect, useMemo, useOptimistic, useCallback, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlaceGrid } from "@/components/places/place-grid"
import { InboxToolbar, type ConfidenceFilter } from "@/components/inbox/inbox-toolbar"
import { useConfidenceSelection } from "@/hooks/use-bulk-selection"
import { Badge } from "@/components/adapters/badge"
import { toast } from "sonner"
import type { Place } from "@/types/database"

interface InboxClientProps {
  initialPlaces: Place[]
  initialStats: {
    total: number
    byConfidence: {
      high: number
      medium: number
      low: number
      veryLow: number
    }
    needsReview: number
    avgConfidence: number
  }
}

type OptimisticAction =
  | { type: 'confirm'; placeIds: string[] }
  | { type: 'archive'; placeIds: string[] }
  | { type: 'update'; placeId: string; updates: Partial<Place> }

function optimisticReducer(state: Place[], action: OptimisticAction): Place[] {
  switch (action.type) {
    case 'confirm':
      return state.map(place =>
        action.placeIds.includes(place.id)
          ? { ...place, status: 'library' as const }
          : place
      )
    case 'archive':
      return state.map(place =>
        action.placeIds.includes(place.id)
          ? { ...place, status: 'archived' as const }
          : place
      )
    case 'update':
      return state.map(place =>
        place.id === action.placeId
          ? { ...place, ...action.updates }
          : place
      )
    default:
      return state
  }
}

export function InboxClient({ initialPlaces, initialStats }: InboxClientProps) {
  const router = useRouter()
  const [places, setOptimisticPlaces] = useOptimistic(initialPlaces, optimisticReducer)
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showKeyboardHints, setShowKeyboardHints] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Filter places based on confidence filter
  const filteredPlaces = useMemo(() => {
    const inboxPlaces = places.filter(place => place.status === 'inbox')

    switch (confidenceFilter) {
      case 'high':
        return inboxPlaces.filter(place => (place.confidence || 0) >= 0.9)
      case 'medium':
        return inboxPlaces.filter(place => (place.confidence || 0) >= 0.8 && (place.confidence || 0) < 0.9)
      case 'low':
        return inboxPlaces.filter(place => (place.confidence || 0) >= 0.6 && (place.confidence || 0) < 0.8)
      case 'very-low':
        return inboxPlaces.filter(place => (place.confidence || 0) < 0.6)
      default:
        return inboxPlaces
    }
  }, [places, confidenceFilter])

  // Bulk selection hook
  const bulkSelection = useConfidenceSelection(filteredPlaces, {
    allowRangeSelection: true,
    allowToggleSelection: true
  })

  // API call functions
  const confirmPlaces = useCallback(async (placeIds: string[]) => {
    setIsLoading(true)
    startTransition(() => {
      setOptimisticPlaces({ type: 'confirm', placeIds })
    })

    try {
      const response = await fetch('/api/places/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', placeIds })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to confirm places')
      }

      const result = await response.json()
      toast.success(`Confirmed ${result.result?.updatedCount || 0} places`)

      // Clear selection after successful operation
      bulkSelection.selectNone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm places')
      console.error('Error confirming places:', error)
    } finally {
      setIsLoading(false)
    }
  }, [bulkSelection])

  const archivePlaces = useCallback(async (placeIds: string[]) => {
    setIsLoading(true)
    startTransition(() => {
      setOptimisticPlaces({ type: 'archive', placeIds })
    })

    try {
      const response = await fetch('/api/places/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', placeIds })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to archive places')
      }

      const result = await response.json()
      toast.success(`Archived ${result.result?.updatedCount || 0} places`)

      // Clear selection after successful operation
      bulkSelection.selectNone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive places')
      console.error('Error archiving places:', error)
    } finally {
      setIsLoading(false)
    }
  }, [bulkSelection])

  // Individual place actions
  const handleConfirmPlace = useCallback((placeId: string) => {
    confirmPlaces([placeId])
  }, [confirmPlaces])

  const handleArchivePlace = useCallback((placeId: string) => {
    console.log('handleArchivePlace called with:', placeId)
    archivePlaces([placeId])
  }, [archivePlaces])

  const handleEditPlace = useCallback((placeId: string) => {
    router.push(`/review?placeId=${placeId}`)
  }, [router])

  const handleMergePlace = useCallback((placeId: string) => {
    // TODO: Implement merge workflow
    toast.info('Merge functionality coming soon')
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when input elements are focused
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA' ||
          document.activeElement?.role === 'combobox') {
        return
      }

      switch (e.key) {
        case 'j':
          e.preventDefault()
          setCurrentIndex(prev => Math.min(prev + 1, filteredPlaces.length - 1))
          break
        case 'k':
          e.preventDefault()
          setCurrentIndex(prev => Math.max(prev - 1, 0))
          break
        case 'c':
          e.preventDefault()
          if (filteredPlaces[currentIndex]) {
            handleConfirmPlace(filteredPlaces[currentIndex].id)
          }
          break
        case 'C':
          e.preventDefault()
          if (bulkSelection.selectedCount > 0) {
            confirmPlaces(bulkSelection.selectedIds)
          }
          break
        case 'x':
          e.preventDefault()
          if (filteredPlaces[currentIndex]) {
            handleArchivePlace(filteredPlaces[currentIndex].id)
          }
          break
        case 'X':
          e.preventDefault()
          if (bulkSelection.selectedCount > 0) {
            archivePlaces(bulkSelection.selectedIds)
          }
          break
        case ' ':
          e.preventDefault()
          if (filteredPlaces[currentIndex]) {
            bulkSelection.toggleItem(filteredPlaces[currentIndex].id)
          }
          break
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            bulkSelection.selectAll()
          }
          break
        case '?':
          e.preventDefault()
          setShowKeyboardHints(prev => !prev)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, filteredPlaces, bulkSelection, handleConfirmPlace, handleArchivePlace, confirmPlaces, archivePlaces])

  // Auto-scroll to current item
  useEffect(() => {
    const currentElement = document.querySelector(`[data-place-index="${currentIndex}"]`)
    if (currentElement) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentIndex])

  if (filteredPlaces.length === 0) {
    return (
      <div className="space-y-6">
        <InboxToolbar
          selectedCount={bulkSelection.selectedCount}
          totalCount={0}
          isAllSelected={bulkSelection.isAllSelected}
          isSomeSelected={bulkSelection.isSomeSelected}
          onConfirmSelected={() => confirmPlaces(bulkSelection.selectedIds)}
          onArchiveSelected={() => archivePlaces(bulkSelection.selectedIds)}
          onSelectAll={bulkSelection.selectAll}
          onSelectNone={bulkSelection.selectNone}
          confidenceFilter={confidenceFilter}
          onConfidenceFilterChange={setConfidenceFilter}
          onSelectHighConfidence={bulkSelection.selectHighConfidence}
          onSelectMediumConfidence={bulkSelection.selectMediumConfidence}
          onSelectLowConfidence={bulkSelection.selectLowConfidence}
          showKeyboardHints={showKeyboardHints}
          onToggleKeyboardHints={() => setShowKeyboardHints(prev => !prev)}
          disabled={isLoading}
          loading={isLoading}
        />

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
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">
            {confidenceFilter === 'all' ? 'Inbox is empty' : `No ${confidenceFilter} confidence places`}
          </h3>
          <p className="text-sm text-muted-foreground">
            {confidenceFilter === 'all'
              ? 'Upload some screenshots or add places to get started'
              : 'Try adjusting your confidence filter'
            }
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <InboxToolbar
        selectedCount={bulkSelection.selectedCount}
        totalCount={filteredPlaces.length}
        isAllSelected={bulkSelection.isAllSelected}
        isSomeSelected={bulkSelection.isSomeSelected}
        onConfirmSelected={() => confirmPlaces(bulkSelection.selectedIds)}
        onArchiveSelected={() => archivePlaces(bulkSelection.selectedIds)}
        onSelectAll={bulkSelection.selectAll}
        onSelectNone={bulkSelection.selectNone}
        confidenceFilter={confidenceFilter}
        onConfidenceFilterChange={setConfidenceFilter}
        onSelectHighConfidence={bulkSelection.selectHighConfidence}
        onSelectMediumConfidence={bulkSelection.selectMediumConfidence}
        onSelectLowConfidence={bulkSelection.selectLowConfidence}
        showKeyboardHints={showKeyboardHints}
        onToggleKeyboardHints={() => setShowKeyboardHints(prev => !prev)}
        disabled={isLoading}
        loading={isLoading}
      />

      {/* Summary stats */}
      <div className="flex gap-2">
        <Badge variant="secondary">{filteredPlaces.length} items</Badge>
        <Badge variant="default">
          {Math.round(filteredPlaces.reduce((sum, p) => sum + (p.confidence || 0), 0) / filteredPlaces.length * 100)}% avg confidence
        </Badge>
        {bulkSelection.selectedCount > 0 && (
          <Badge variant="outline">{bulkSelection.selectedCount} selected</Badge>
        )}
      </div>

      {/* Places grid with virtualization for large lists */}
      <PlaceGrid
        places={filteredPlaces}
        showActions={true}
        showConfidence={true}
        selectable={true}
        selected={bulkSelection.selectedIds}
        onItemClick={bulkSelection.handleItemClick}
        showKeyboardHints={showKeyboardHints}
        onConfirm={handleConfirmPlace}
        onArchive={handleArchivePlace}
        onEdit={handleEditPlace}
        onMerge={handleMergePlace}
        virtualizeThreshold={200} // Enable virtualization for 200+ places
        containerHeight={500} // Reasonable height for inbox view
        enablePerformanceMonitoring={process.env.NODE_ENV === 'development'}
      />
    </div>
  )
}