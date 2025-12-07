"use client"

import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import Map, {
  Source,
  Layer,
  NavigationControl,
  Popup,
  type MapRef,
  type LayerProps,
  type MapMouseEvent
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useCollectionMapContext } from './collection-map-context'
import { getDefaultCenter } from '@/lib/map-utils'
import { MapPin } from 'lucide-react'

interface PopupInfo {
  longitude: number
  latitude: number
  name: string
  orderNumber: number
}

export function CollectionMapboxMap() {
  const {
    currentPlaces,
    selectedPlaceId,
    hoveredPlaceId,
    transportMode,
    hoverPlace,
    selectPlace,
    setMapRef,
    flyToPlace
  } = useCollectionMapContext()

  const mapRef = useRef<MapRef>(null)
  const hoveredIdRef = useRef<string | number | null>(null)
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const placesWithCoords = useMemo(() => {
    return currentPlaces.filter(p =>
      p.coords &&
      typeof p.coords === 'object' &&
      'lat' in p.coords &&
      'lon' in p.coords
    )
  }, [currentPlaces])

  const placesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: placesWithCoords.map((place, index) => {
      const coords = place.coords as { lat: number; lon: number }
      return {
        type: 'Feature' as const,
        id: index,
        geometry: {
          type: 'Point' as const,
          coordinates: [coords.lon, coords.lat]
        },
        properties: {
          id: place.id,
          name: place.name,
          orderNumber: index + 1
        }
      }
    })
  }), [placesWithCoords])

  const routeLineGeoJSON = useMemo(() => {
    if (placesWithCoords.length < 2) return null

    const coordinates = placesWithCoords.map(p => {
      const coords = p.coords as { lat: number; lon: number }
      return [coords.lon, coords.lat]
    })

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates
      },
      properties: {
        transportMode
      }
    }
  }, [placesWithCoords, transportMode])

  const defaultCenter = useMemo(() => {
    const mapPlaces = currentPlaces.map(p => ({
      ...p,
      isSelected: false,
      isHovered: false
    }))
    return getDefaultCenter(mapPlaces)
  }, [currentPlaces])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    placesGeoJSON.features.forEach(feature => {
      try {
        mapRef.current?.setFeatureState(
          { source: 'places', id: feature.id },
          {
            hover: feature.properties.id === hoveredPlaceId,
            selected: feature.properties.id === selectedPlaceId
          }
        )
      } catch {
        // Source not ready yet
      }
    })
  }, [hoveredPlaceId, selectedPlaceId, placesGeoJSON, mapLoaded])

  const routeLayer: LayerProps = useMemo(() => ({
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': transportMode === 'drive' ? '#3b82f6' : '#22c55e',
      'line-width': 3,
      'line-dasharray': [2, 2]
    }
  }), [transportMode])

  const markerLayer: LayerProps = useMemo(() => ({
    id: 'place-markers',
    type: 'circle',
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        14,
        ['boolean', ['feature-state', 'selected'], false],
        12,
        10
      ],
      'circle-color': transportMode === 'drive' ? '#3b82f6' : '#22c55e',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  }), [transportMode])

  const numberLayer: LayerProps = useMemo(() => ({
    id: 'marker-numbers',
    type: 'symbol',
    layout: {
      'text-field': ['to-string', ['get', 'orderNumber']],
      'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-allow-overlap': true
    },
    paint: {
      'text-color': '#ffffff'
    }
  }), [])

  const onMouseEnter = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature) return

    const map = mapRef.current
    if (!map) return

    map.getCanvas().style.cursor = 'pointer'

    if (hoveredIdRef.current !== null) {
      try {
        map.setFeatureState(
          { source: 'places', id: hoveredIdRef.current },
          { hover: false }
        )
      } catch {
        // Ignore
      }
    }

    const featureId = feature.id
    if (featureId !== undefined) {
      try {
        map.setFeatureState(
          { source: 'places', id: featureId },
          { hover: true }
        )
      } catch {
        // Ignore
      }
      hoveredIdRef.current = featureId
      hoverPlace(feature.properties?.id || null)

      const coords = (feature.geometry as GeoJSON.Point).coordinates
      setPopupInfo({
        longitude: coords[0],
        latitude: coords[1],
        name: feature.properties?.name || '',
        orderNumber: feature.properties?.orderNumber || 0
      })
    }
  }, [hoverPlace])

  const onMouseLeave = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    map.getCanvas().style.cursor = ''

    if (hoveredIdRef.current !== null) {
      try {
        map.setFeatureState(
          { source: 'places', id: hoveredIdRef.current },
          { hover: false }
        )
      } catch {
        // Ignore
      }
      hoveredIdRef.current = null
      hoverPlace(null)
    }
    setPopupInfo(null)
  }, [hoverPlace])

  const onClick = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0]
    if (feature) {
      const placeId = feature.properties?.id
      if (placeId) {
        selectPlace(placeId)
        flyToPlace(placeId)
      }
    }
  }, [selectPlace, flyToPlace])

  const onLoad = useCallback(() => {
    if (mapRef.current) {
      setMapRef(mapRef.current)
      setMapLoaded(true)
    }
  }, [setMapRef])

  if (placesWithCoords.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-2 p-8">
          <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Add places with coordinates to see the map
          </p>
        </div>
      </div>
    )
  }

  return (
    <Map
      ref={mapRef}
      reuseMaps
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{
        longitude: defaultCenter[0],
        latitude: defaultCenter[1],
        zoom: 10
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      onLoad={onLoad}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      interactiveLayerIds={['place-markers']}
    >
      <NavigationControl position="top-right" />

      {routeLineGeoJSON && (
        <Source id="route" type="geojson" data={routeLineGeoJSON}>
          <Layer {...routeLayer} />
        </Source>
      )}

      <Source id="places" type="geojson" data={placesGeoJSON}>
        <Layer {...markerLayer} />
        <Layer {...numberLayer} />
      </Source>

      {popupInfo && (
        <Popup
          longitude={popupInfo.longitude}
          latitude={popupInfo.latitude}
          anchor="bottom"
          offset={15}
          closeButton={false}
          closeOnClick={false}
        >
          <div className="px-2 py-1">
            <p className="font-medium text-sm">
              {popupInfo.orderNumber}. {popupInfo.name}
            </p>
          </div>
        </Popup>
      )}
    </Map>
  )
}
