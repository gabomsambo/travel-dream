"use client"

import { useRef, useEffect, useState, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { PlaceCard } from "./place-card"
import type { Place } from "@/types/database"

interface VirtualizedPlaceGridProps {
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
  itemHeight?: number
  overscan?: number
  containerHeight?: number
  columnsConfig?: {
    sm: number
    md: number
    lg: number
    xl: number
  }
}

interface GridItem {
  place: Place
  columnIndex: number
  rowIndex: number
  isVisible: boolean
}

// Default responsive column configuration
const DEFAULT_COLUMNS = {
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4
}

// Calculate item height based on place card content
const calculateItemHeight = (place: Place, showConfidence: boolean = false): number => {
  let baseHeight = 220 // Base card height

  // Add height for confidence indicator
  if (showConfidence) baseHeight += 24

  // Add height for tags (estimate based on tag count)
  if (place.tags && place.tags.length > 0) {
    const tagRows = Math.ceil(place.tags.length / 3) // Estimate 3 tags per row
    baseHeight += tagRows * 24
  }

  // Add height for notes preview
  if (place.notes && place.notes.length > 50) {
    baseHeight += 20
  }

  return Math.min(baseHeight + 40, 320) // Add padding, cap at max height
}

// Use intersection observer for lazy loading
function useIntersectionObserver(threshold = 0.1) {
  const [visibleItems, setVisibleItems] = useState(new Set<string>())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const elementsRef = useRef(new Map<string, Element>())

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleItems(prev => {
          const newVisible = new Set(prev)
          entries.forEach(entry => {
            const itemId = entry.target.getAttribute('data-item-id')
            if (itemId) {
              if (entry.isIntersecting) {
                newVisible.add(itemId)
              } else {
                newVisible.delete(itemId)
              }
            }
          })
          return newVisible
        })
      },
      { threshold }
    )

    return () => {
      observerRef.current?.disconnect()
    }
  }, [threshold])

  const observeElement = (element: Element, itemId: string) => {
    if (observerRef.current && element) {
      element.setAttribute('data-item-id', itemId)
      observerRef.current.observe(element)
      elementsRef.current.set(itemId, element)
    }
  }

  const unobserveElement = (itemId: string) => {
    const element = elementsRef.current.get(itemId)
    if (observerRef.current && element) {
      observerRef.current.unobserve(element)
      elementsRef.current.delete(itemId)
    }
  }

  return { visibleItems, observeElement, unobserveElement }
}

// Get responsive column count based on screen width
function useResponsiveColumns(columnsConfig = DEFAULT_COLUMNS) {
  const [columns, setColumns] = useState(columnsConfig.lg)

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth
      if (width >= 1280) {
        setColumns(columnsConfig.xl)
      } else if (width >= 1024) {
        setColumns(columnsConfig.lg)
      } else if (width >= 768) {
        setColumns(columnsConfig.md)
      } else {
        setColumns(columnsConfig.sm)
      }
    }

    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [columnsConfig])

  return columns
}

export function VirtualizedPlaceGrid({
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
  itemHeight = 280,
  overscan = 5,
  containerHeight = 600,
  columnsConfig = DEFAULT_COLUMNS
}: VirtualizedPlaceGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const columns = useResponsiveColumns(columnsConfig)
  const { visibleItems, observeElement, unobserveElement } = useIntersectionObserver(0.1)

  // Calculate grid items organized by rows
  const gridItems = useMemo(() => {
    const items: GridItem[] = []
    const rowCount = Math.ceil(places.length / columns)

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
        const placeIndex = rowIndex * columns + columnIndex
        if (placeIndex < places.length) {
          const place = places[placeIndex]
          items.push({
            place,
            columnIndex,
            rowIndex,
            isVisible: visibleItems.has(place.id)
          })
        }
      }
    }

    return items
  }, [places, columns, visibleItems])

  // Calculate dynamic row heights
  const getRowHeight = useMemo(() => {
    const rowHeights = new Map<number, number>()

    for (let rowIndex = 0; rowIndex < Math.ceil(places.length / columns); rowIndex++) {
      let maxHeight = itemHeight

      for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
        const placeIndex = rowIndex * columns + columnIndex
        if (placeIndex < places.length) {
          const place = places[placeIndex]
          const height = calculateItemHeight(place, showConfidence)
          maxHeight = Math.max(maxHeight, height)
        }
      }

      rowHeights.set(rowIndex, maxHeight + 16) // Add gap
    }

    return (index: number) => rowHeights.get(index) || itemHeight
  }, [places, columns, showConfidence, itemHeight])

  // Virtual row calculator
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(places.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: getRowHeight,
    overscan
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

  return (
    <div
      ref={parentRef}
      className="w-full overflow-auto"
      style={{ height: containerHeight }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowIndex = virtualRow.index
          const rowPlaces = []

          // Get places for this row
          for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
            const placeIndex = rowIndex * columns + columnIndex
            if (placeIndex < places.length) {
              rowPlaces.push({
                place: places[placeIndex],
                placeIndex
              })
            }
          }

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-4 h-full p-2"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
                }}
              >
                {rowPlaces.map(({ place, placeIndex }) => (
                  <VirtualizedPlaceCard
                    key={place.id}
                    place={place}
                    index={placeIndex}
                    showActions={showActions}
                    showConfidence={showConfidence}
                    selectable={selectable}
                    selected={selected.includes(place.id)}
                    onSelectionChange={onSelectionChange}
                    onItemClick={onItemClick}
                    showKeyboardHints={showKeyboardHints}
                    onConfirm={onConfirm}
                    onArchive={onArchive}
                    onEdit={onEdit}
                    onMerge={onMerge}
                    onView={onView}
                    onObserve={(element) => observeElement(element, place.id)}
                    onUnobserve={() => unobserveElement(place.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Virtualized place card with lazy loading
interface VirtualizedPlaceCardProps {
  place: Place
  index: number
  showActions?: boolean
  showConfidence?: boolean
  selectable?: boolean
  selected?: boolean
  onSelectionChange?: (placeId: string, selected: boolean) => void
  onItemClick?: (placeId: string, index: number, event: React.MouseEvent) => void
  showKeyboardHints?: boolean
  onConfirm?: (placeId: string) => void
  onArchive?: (placeId: string) => void
  onEdit?: (placeId: string) => void
  onMerge?: (placeId: string) => void
  onView?: (placeId: string) => void
  onObserve?: (element: Element) => void
  onUnobserve?: () => void
}

function VirtualizedPlaceCard({
  place,
  index,
  onObserve,
  onUnobserve,
  ...cardProps
}: VirtualizedPlaceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = cardRef.current
    if (element && onObserve) {
      onObserve(element)
    }

    return () => {
      if (onUnobserve) {
        onUnobserve()
      }
    }
  }, [onObserve, onUnobserve])

  return (
    <div ref={cardRef} className="h-full">
      <PlaceCard
        place={place}
        index={index}
        {...cardProps}
      />
    </div>
  )
}