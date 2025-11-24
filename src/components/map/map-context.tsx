"use client"

import { createContext, useContext, useState, useRef, useMemo, useCallback, type ReactNode } from 'react'
import type { MapRef } from 'react-map-gl/mapbox'
import type { Place, Collection, DayBucket } from '@/types/database'
import type { MapPlace, MapFilters, MapContextValue } from '@/types/map'
import { calculateBounds } from '@/lib/map-utils'

const defaultFilters: MapFilters = {
  collectionId: null,
  kinds: [],
  search: '',
  showUnvisitedOnly: false,
  showDayOverlay: false,
  activeDays: []
}

const MapContext = createContext<MapContextValue | null>(null)

interface MapProviderProps {
  children: ReactNode
  initialPlaces: Place[]
  collections: Collection[]
}

export function MapProvider({ children, initialPlaces, collections }: MapProviderProps) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null)
  const [filters, setFilters] = useState<MapFilters>(defaultFilters)

  const mapRef = useRef<MapRef | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const placeIndexMap = useRef<Map<string, number>>(new Map())

  const selectedCollection = useMemo(() => {
    if (!filters.collectionId) return null
    return collections.find(c => c.id === filters.collectionId) || null
  }, [collections, filters.collectionId])

  const dayLookup = useMemo(() => {
    if (!selectedCollection || !filters.showDayOverlay) return new Map<string, number>()

    const lookup = new Map<string, number>()
    const dayBuckets = (selectedCollection.dayBuckets as DayBucket[]) || []

    dayBuckets.forEach(bucket => {
      bucket.placeIds.forEach(placeId => {
        lookup.set(placeId, bucket.dayNumber)
      })
    })

    return lookup
  }, [selectedCollection, filters.showDayOverlay])

  const places: MapPlace[] = useMemo(() => {
    return initialPlaces.map(place => ({
      ...place,
      isSelected: place.id === selectedPlaceId,
      isHovered: place.id === hoveredPlaceId,
      dayNumber: dayLookup.get(place.id)
    }))
  }, [initialPlaces, selectedPlaceId, hoveredPlaceId, dayLookup])

  const filteredPlaces = useMemo(() => {
    let result = places

    if (filters.collectionId && selectedCollection) {
      const collectionPlaceIds = new Set<string>()
      const dayBuckets = (selectedCollection.dayBuckets as DayBucket[]) || []
      const unscheduledIds = (selectedCollection.unscheduledPlaceIds as string[]) || []

      dayBuckets.forEach(bucket => {
        bucket.placeIds.forEach(id => collectionPlaceIds.add(id))
      })
      unscheduledIds.forEach(id => collectionPlaceIds.add(id))

      result = result.filter(p => collectionPlaceIds.has(p.id))
    }

    if (filters.kinds.length > 0) {
      result = result.filter(p => filters.kinds.includes(p.kind))
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.city?.toLowerCase().includes(searchLower) ||
        p.country?.toLowerCase().includes(searchLower)
      )
    }

    if (filters.showUnvisitedOnly) {
      result = result.filter(p => p.visitStatus !== 'visited')
    }

    if (filters.showDayOverlay && filters.activeDays.length > 0) {
      result = result.filter(p => p.dayNumber && filters.activeDays.includes(p.dayNumber))
    }

    placeIndexMap.current = new Map(result.map((p, i) => [p.id, i]))

    return result
  }, [places, filters, selectedCollection])

  const selectPlace = useCallback((id: string | null) => {
    setSelectedPlaceId(id)
  }, [])

  const hoverPlace = useCallback((id: string | null) => {
    setHoveredPlaceId(id)
  }, [])

  const updateFilters = useCallback((newFilters: Partial<MapFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }, [])

  const fitBounds = useCallback(() => {
    const bounds = calculateBounds(filteredPlaces)
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 1000
      })
    }
  }, [filteredPlaces])

  const flyTo = useCallback((lng: number, lat: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 14,
        duration: 1500
      })
    }
  }, [])

  const scrollToPlace = useCallback((id: string) => {
    const index = placeIndexMap.current.get(id)
    if (index !== undefined && listRef.current) {
      const element = listRef.current.querySelector(`[data-place-id="${id}"]`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [])

  const value: MapContextValue = {
    places,
    filteredPlaces,
    collections,
    selectedPlaceId,
    hoveredPlaceId,
    filters,
    selectPlace,
    hoverPlace,
    updateFilters,
    fitBounds,
    flyTo,
    mapRef: mapRef as React.RefObject<mapboxgl.Map | null>,
    listRef,
    scrollToPlace
  }

  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  )
}

export function useMapContext() {
  const context = useContext(MapContext)
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider')
  }
  return context
}
