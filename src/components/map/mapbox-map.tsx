"use client"

import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import Map, {
  Source,
  Layer,
  NavigationControl,
  Popup,
  MapRef,
  type LayerProps,
  type MapMouseEvent
} from 'react-map-gl/mapbox'
import type mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useMapContext } from './map-context'
import { placesToGeoJSON, getKindColor, getDayColor, getDefaultCenter } from '@/lib/map-utils'

interface PopupInfo {
  longitude: number
  latitude: number
  name: string
  city: string | null
  country: string | null
}

const clusterLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  source: 'places',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'step',
      ['get', 'point_count'],
      '#51bbd6',
      10,
      '#f1f075',
      50,
      '#f28cb1'
    ],
    'circle-radius': [
      'step',
      ['get', 'point_count'],
      15,
      10,
      20,
      50,
      25
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff'
  }
}

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'places',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 12
  }
}

export function MapboxMap() {
  const {
    filteredPlaces,
    selectedPlaceId,
    hoveredPlaceId,
    filters,
    selectPlace,
    hoverPlace,
    scrollToPlace,
    flyTo
  } = useMapContext()

  const mapRef = useRef<MapRef>(null)
  const hoveredIdRef = useRef<string | number | null>(null)
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null)

  const geojsonData = useMemo(() => {
    return placesToGeoJSON(filteredPlaces)
  }, [filteredPlaces])

  const defaultCenter = useMemo(() => {
    return getDefaultCenter(filteredPlaces)
  }, [filteredPlaces])

  const unclusteredPointLayer: LayerProps = useMemo(() => ({
    id: 'unclustered-point',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': filters.showDayOverlay
        ? [
            'case',
            ['has', 'dayNumber', ['get', 'properties']],
            [
              'match',
              ['get', 'dayNumber'],
              1, getDayColor(1),
              2, getDayColor(2),
              3, getDayColor(3),
              4, getDayColor(4),
              5, getDayColor(5),
              6, getDayColor(6),
              7, getDayColor(7),
              8, getDayColor(8),
              '#64748b'
            ],
            '#64748b'
          ]
        : [
            'match',
            ['get', 'kind'],
            'restaurant', getKindColor('restaurant'),
            'cafe', getKindColor('cafe'),
            'bar', getKindColor('bar'),
            'museum', getKindColor('museum'),
            'gallery', getKindColor('gallery'),
            'park', getKindColor('park'),
            'beach', getKindColor('beach'),
            'natural', getKindColor('natural'),
            'viewpoint', getKindColor('viewpoint'),
            'hotel', getKindColor('hotel'),
            'hostel', getKindColor('hostel'),
            'stay', getKindColor('stay'),
            'shop', getKindColor('shop'),
            'market', getKindColor('market'),
            'landmark', getKindColor('landmark'),
            'city', getKindColor('city'),
            'experience', getKindColor('experience'),
            'tour', getKindColor('tour'),
            'transit', getKindColor('transit'),
            'tip', getKindColor('tip'),
            '#64748b'
          ],
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        10,
        ['boolean', ['feature-state', 'selected'], false],
        9,
        6
      ],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        3,
        ['boolean', ['feature-state', 'hover'], false],
        2,
        1
      ],
      'circle-stroke-color': '#fff'
    }
  }), [filters.showDayOverlay])

  const onClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return

    const clusterId = feature.properties?.cluster_id

    if (clusterId) {
      const mapboxSource = mapRef.current?.getSource('places') as mapboxgl.GeoJSONSource
      if (mapboxSource) {
        mapboxSource.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return
          const coords = (feature.geometry as GeoJSON.Point).coordinates
          mapRef.current?.easeTo({
            center: [coords[0], coords[1]],
            zoom: zoom || 14,
            duration: 500
          })
        })
      }
    } else {
      const placeId = feature.properties?.id
      if (placeId) {
        selectPlace(placeId)
        scrollToPlace(placeId)
      }
    }
  }, [selectPlace, scrollToPlace])

  const onMouseEnter = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature || feature.properties?.cluster_id) return

    const map = mapRef.current
    if (!map) return

    map.getCanvas().style.cursor = 'pointer'

    if (hoveredIdRef.current !== null) {
      map.setFeatureState(
        { source: 'places', id: hoveredIdRef.current },
        { hover: false }
      )
    }

    const featureId = feature.id
    if (featureId !== undefined) {
      map.setFeatureState(
        { source: 'places', id: featureId },
        { hover: true }
      )
      hoveredIdRef.current = featureId
      hoverPlace(feature.properties?.id || null)

      const coords = (feature.geometry as GeoJSON.Point).coordinates
      setPopupInfo({
        longitude: coords[0],
        latitude: coords[1],
        name: feature.properties?.name || '',
        city: feature.properties?.city || null,
        country: feature.properties?.country || null
      })
    }
  }, [hoverPlace])

  const onMouseLeave = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    map.getCanvas().style.cursor = ''

    if (hoveredIdRef.current !== null) {
      map.setFeatureState(
        { source: 'places', id: hoveredIdRef.current },
        { hover: false }
      )
      hoveredIdRef.current = null
      hoverPlace(null)
    }
    setPopupInfo(null)
  }, [hoverPlace])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedPlaceId) return

    const selectedPlace = filteredPlaces.find(p => p.id === selectedPlaceId)
    if (selectedPlace?.coords && typeof selectedPlace.coords === 'object' && 'lat' in selectedPlace.coords) {
      const coords = selectedPlace.coords as { lat: number; lon: number }

      geojsonData.features.forEach(feature => {
        if (feature.id) {
          map.setFeatureState(
            { source: 'places', id: feature.id },
            { selected: feature.properties.id === selectedPlaceId }
          )
        }
      })
    }
  }, [selectedPlaceId, filteredPlaces, geojsonData])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    geojsonData.features.forEach(feature => {
      if (feature.id) {
        map.setFeatureState(
          { source: 'places', id: feature.id },
          { hover: feature.properties.id === hoveredPlaceId }
        )
      }
    })
  }, [hoveredPlaceId, geojsonData])

  return (
    <Map
      ref={mapRef}
      reuseMaps
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{
        longitude: defaultCenter[0],
        latitude: defaultCenter[1],
        zoom: 3
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      interactiveLayerIds={['clusters', 'unclustered-point']}
    >
      <NavigationControl position="top-right" />

      <Source
        id="places"
        type="geojson"
        data={geojsonData}
        cluster={true}
        clusterMaxZoom={14}
        clusterRadius={50}
        generateId={true}
      >
        <Layer {...clusterLayer} />
        <Layer {...clusterCountLayer} />
        <Layer {...unclusteredPointLayer} />
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
            <p className="font-medium text-sm">{popupInfo.name}</p>
            {(popupInfo.city || popupInfo.country) && (
              <p className="text-xs text-muted-foreground">
                {[popupInfo.city, popupInfo.country].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </Popup>
      )}
    </Map>
  )
}
