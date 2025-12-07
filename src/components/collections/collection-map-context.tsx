"use client"

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import type { MapRef } from 'react-map-gl/mapbox'
import type { Place, Collection, DayBucket } from '@/types/database'
import { calculateBounds, getDefaultCenter } from '@/lib/map-utils'
import type { LngLatBounds } from 'mapbox-gl'

export type CollectionMapMode = 'itinerary' | 'day'

export interface MapViewConfig {
  mode: CollectionMapMode
  places: Place[]
  transportMode: 'drive' | 'walk'
  dayNumber?: number
}

export interface CollectionMapContextValue {
  collection: (Collection & { places: Place[] }) | null
  mapRef: React.RefObject<MapRef | null>
  selectedPlaceId: string | null
  hoveredPlaceId: string | null
  mode: CollectionMapMode | null
  currentPlaces: Place[]
  currentDayNumber: number | null
  transportMode: 'drive' | 'walk'
  selectPlace: (id: string | null) => void
  hoverPlace: (id: string | null) => void
  updateMapView: (config: MapViewConfig) => void
  flyToPlace: (placeId: string) => void
  fitBounds: () => void
  setMapRef: (ref: MapRef | null) => void
  refreshCollection: () => void
}

const CollectionMapContext = createContext<CollectionMapContextValue | null>(null)

interface CollectionMapProviderProps {
  initialCollection: Collection & { places: Place[] }
  initialTransportMode?: 'drive' | 'walk'
  children: ReactNode
}

export function CollectionMapProvider({
  initialCollection,
  initialTransportMode = 'drive',
  children
}: CollectionMapProviderProps) {
  const mapRef = useRef<MapRef | null>(null)
  const [collection, setCollection] = useState(initialCollection)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null)
  const [mode, setMode] = useState<CollectionMapMode | null>('itinerary')
  const [currentPlaces, setCurrentPlaces] = useState<Place[]>(initialCollection.places)
  const [currentDayNumber, setCurrentDayNumber] = useState<number | null>(null)
  const [transportMode, setTransportMode] = useState<'drive' | 'walk'>(initialTransportMode)

  const selectPlace = useCallback((id: string | null) => {
    setSelectedPlaceId(id)
  }, [])

  const hoverPlace = useCallback((id: string | null) => {
    setHoveredPlaceId(id)
  }, [])

  const fitBoundsInternal = useCallback((places: Place[]) => {
    if (!mapRef.current || places.length === 0) return

    const mapPlaces = places.map(p => ({
      ...p,
      isSelected: false,
      isHovered: false
    }))

    const bounds = calculateBounds(mapPlaces)
    if (bounds) {
      mapRef.current.fitBounds(bounds as LngLatBounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 15,
        duration: 500
      })
    }
  }, [])

  const updateMapView = useCallback((config: MapViewConfig) => {
    setMode(config.mode)
    // Only update places if content actually changed (prevents infinite loops)
    setCurrentPlaces(prev => {
      if (prev.length === config.places.length &&
          prev.every((p, i) => p.id === config.places[i]?.id)) {
        return prev // Same content, return same reference
      }
      return config.places
    })
    setCurrentDayNumber(config.dayNumber ?? null)
    setTransportMode(config.transportMode)

    setTimeout(() => {
      fitBoundsInternal(config.places)
    }, 100)
  }, [fitBoundsInternal])

  const flyToPlace = useCallback((placeId: string) => {
    const place = currentPlaces.find(p => p.id === placeId)
    if (place?.coords && mapRef.current) {
      const coords = place.coords as { lat: number; lon: number }
      mapRef.current.flyTo({
        center: [coords.lon, coords.lat],
        zoom: 14,
        duration: 1000
      })
    }
  }, [currentPlaces])

  const fitBounds = useCallback(() => {
    fitBoundsInternal(currentPlaces)
  }, [currentPlaces, fitBoundsInternal])

  const setMapRef = useCallback((ref: MapRef | null) => {
    mapRef.current = ref
    if (ref && currentPlaces.length > 0) {
      setTimeout(() => {
        fitBoundsInternal(currentPlaces)
      }, 100)
    }
  }, [currentPlaces, fitBoundsInternal])

  const refreshCollection = useCallback(() => {
    setCurrentPlaces(collection.places)
  }, [collection.places])

  useEffect(() => {
    setCollection(initialCollection)
    setCurrentPlaces(initialCollection.places)
  }, [initialCollection])

  const value: CollectionMapContextValue = {
    collection,
    mapRef,
    selectedPlaceId,
    hoveredPlaceId,
    mode,
    currentPlaces,
    currentDayNumber,
    transportMode,
    selectPlace,
    hoverPlace,
    updateMapView,
    flyToPlace,
    fitBounds,
    setMapRef,
    refreshCollection
  }

  return (
    <CollectionMapContext.Provider value={value}>
      {children}
    </CollectionMapContext.Provider>
  )
}

export function useCollectionMapContext() {
  const context = useContext(CollectionMapContext)
  if (!context) {
    throw new Error('useCollectionMapContext must be used within a CollectionMapProvider')
  }
  return context
}

export function useCollectionMapContextOptional() {
  return useContext(CollectionMapContext)
}

export function useCollectionData() {
  const context = useContext(CollectionMapContext)
  if (!context?.collection) {
    throw new Error('useCollectionData must be used within a CollectionMapProvider with a collection')
  }
  return context.collection
}
