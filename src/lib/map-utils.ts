import type { MapPlace, PlaceFeatureProperties } from '@/types/map'
import { LngLatBounds } from 'mapbox-gl'

export function placesToGeoJSON(places: MapPlace[]): GeoJSON.FeatureCollection<GeoJSON.Point, PlaceFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: places
      .filter(p => p.coords && typeof p.coords === 'object' && 'lat' in p.coords && 'lon' in p.coords)
      .map(place => ({
        type: 'Feature' as const,
        id: place.id,
        geometry: {
          type: 'Point' as const,
          coordinates: [(place.coords as { lat: number; lon: number }).lon, (place.coords as { lat: number; lon: number }).lat]
        },
        properties: {
          id: place.id,
          name: place.name,
          kind: place.kind,
          city: place.city,
          country: place.country,
          dayNumber: place.dayNumber
        }
      }))
  }
}

export function calculateBounds(places: MapPlace[]): LngLatBounds | null {
  const placesWithCoords = places.filter(
    p => p.coords && typeof p.coords === 'object' && 'lat' in p.coords && 'lon' in p.coords
  )

  if (placesWithCoords.length === 0) return null

  const bounds = new LngLatBounds()
  placesWithCoords.forEach(place => {
    const coords = place.coords as { lat: number; lon: number }
    bounds.extend([coords.lon, coords.lat])
  })

  return bounds
}

export function getDefaultCenter(places: MapPlace[]): [number, number] {
  const placesWithCoords = places.filter(
    p => p.coords && typeof p.coords === 'object' && 'lat' in p.coords && 'lon' in p.coords
  )

  if (placesWithCoords.length === 0) {
    return [0, 20]
  }

  let sumLng = 0
  let sumLat = 0
  placesWithCoords.forEach(place => {
    const coords = place.coords as { lat: number; lon: number }
    sumLng += coords.lon
    sumLat += coords.lat
  })

  return [sumLng / placesWithCoords.length, sumLat / placesWithCoords.length]
}
