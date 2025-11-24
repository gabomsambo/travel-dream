"use client"

import { useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMapContext } from './map-context'
import { MapPlaceCard } from './map-place-card'
import { MapPin } from 'lucide-react'

export function MapPlaceList() {
  const {
    filteredPlaces,
    selectedPlaceId,
    hoveredPlaceId,
    filters,
    selectPlace,
    hoverPlace,
    flyTo
  } = useMapContext()

  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: filteredPlaces.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 5
  })

  const handlePlaceClick = useCallback((placeId: string) => {
    const place = filteredPlaces.find(p => p.id === placeId)
    if (place?.coords && typeof place.coords === 'object' && 'lat' in place.coords) {
      const coords = place.coords as { lat: number; lon: number }
      selectPlace(placeId)
      flyTo(coords.lon, coords.lat)
    }
  }, [filteredPlaces, selectPlace, flyTo])

  if (filteredPlaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <MapPin className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-medium text-muted-foreground">No places found</h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Try adjusting your filters or add places with coordinates
        </p>
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const place = filteredPlaces[virtualRow.index]
          return (
            <div
              key={place.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <MapPlaceCard
                place={place}
                isSelected={place.id === selectedPlaceId}
                isHovered={place.id === hoveredPlaceId}
                showDayOverlay={filters.showDayOverlay}
                onClick={() => handlePlaceClick(place.id)}
                onMouseEnter={() => hoverPlace(place.id)}
                onMouseLeave={() => hoverPlace(null)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
