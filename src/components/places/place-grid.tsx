"use client"

import { PlaceCard } from "./place-card"
import { VirtualizedPlaceGrid } from "./virtualized-place-grid"
import { useVirtualGrid } from "@/hooks/use-virtual-grid"
import type { Place } from "@/types/database"

interface PlaceGridProps {
  places: Place[]
  showActions?: boolean
  showConfidence?: boolean
  selectable?: boolean
  selected?: string[]
  onSelectionChange?: (placeId: string, selected: boolean) => void
  onItemClick?: (placeId: string, index: number, event: React.MouseEvent) => void
  showKeyboardHints?: boolean
  onConfirm?: (placeId: string) => void
  onArchive?: (placeId: string) => void
  onEdit?: (placeId: string) => void
  onMerge?: (placeId: string) => void
  onView?: (placeId: string) => void
  emptyMessage?: string
  virtualizeThreshold?: number
  containerHeight?: number
  enablePerformanceMonitoring?: boolean
}

export function PlaceGrid({
  places,
  showActions = false,
  showConfidence = false,
  selectable = false,
  selected = [],
  onSelectionChange,
  onItemClick,
  showKeyboardHints = false,
  onConfirm,
  onArchive,
  onEdit,
  onMerge,
  onView,
  emptyMessage = "No places found",
  virtualizeThreshold = 500,
  containerHeight = 600,
  enablePerformanceMonitoring = false
}: PlaceGridProps) {
  // Use virtual grid hook to determine if virtualization should be enabled
  const {
    shouldVirtualize,
    getVirtualGridProps,
    getRegularGridProps,
    performanceMetrics,
    performanceSuggestions
  } = useVirtualGrid(places, {
    threshold: virtualizeThreshold,
    containerHeight,
    enablePerformanceMonitoring
  })
  // Handle empty state
  if (places.length === 0) {
    return (
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
          {emptyMessage}
        </h3>
        <p className="text-sm text-muted-foreground">
          Try adjusting your search or filters
        </p>
      </div>
    )
  }

  // Use virtualized grid for large lists, regular grid for smaller lists
  if (shouldVirtualize) {
    return (
      <div className="space-y-4">
        {/* Performance info for debugging */}
        {enablePerformanceMonitoring && performanceSuggestions.length > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
            <strong>Performance:</strong> {performanceSuggestions.join(', ')}
          </div>
        )}

        <VirtualizedPlaceGrid
          {...getVirtualGridProps()}
          showActions={showActions}
          showConfidence={showConfidence}
          selectable={selectable}
          selected={selected}
          onSelectionChange={onSelectionChange}
          onItemClick={onItemClick}
          showKeyboardHints={showKeyboardHints}
          onConfirm={onConfirm}
          onArchive={onArchive}
          onEdit={onEdit}
          onView={onView}
          emptyMessage={emptyMessage}
        />
      </div>
    )
  }

  // Regular grid for smaller lists
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {places.map((place, index) => (
        <PlaceCard
          key={place.id}
          place={place}
          index={index}
          showActions={showActions}
          showConfidence={showConfidence}
          selectable={selectable}
          selected={selected?.includes(place.id)}
          onSelectionChange={onSelectionChange}
          onItemClick={onItemClick}
          showKeyboardHints={showKeyboardHints}
          onConfirm={onConfirm}
          onArchive={onArchive}
          onEdit={onEdit}
          onView={onView}
        />
      ))}
    </div>
  )
}
