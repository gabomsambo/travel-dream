import type { MapPlace, PlaceFeatureProperties } from '@/types/map'
import { LngLatBounds } from 'mapbox-gl'
import { usablePin } from '@/lib/place-coords'

function placesWithPin(places: MapPlace[]): Array<{ place: MapPlace; pin: { lat: number; lon: number } }> {
  const pinned: Array<{ place: MapPlace; pin: { lat: number; lon: number } }> = []
  for (const place of places) {
    const pin = usablePin(place.coords)
    if (pin) pinned.push({ place, pin })
  }
  return pinned
}

export function placesToGeoJSON(places: MapPlace[]): GeoJSON.FeatureCollection<GeoJSON.Point, PlaceFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: placesWithPin(places).map(({ place, pin }) => ({
      type: 'Feature' as const,
      id: place.id,
      geometry: {
        type: 'Point' as const,
        coordinates: [pin.lon, pin.lat]
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
  const placesWithCoords = placesWithPin(places)

  if (placesWithCoords.length === 0) return null

  const bounds = new LngLatBounds()
  placesWithCoords.forEach(({ pin }) => {
    bounds.extend([pin.lon, pin.lat])
  })

  return bounds
}

export function getDefaultCenter(places: MapPlace[]): [number, number] {
  const placesWithCoords = placesWithPin(places)

  if (placesWithCoords.length === 0) {
    return [0, 20]
  }

  let sumLng = 0
  let sumLat = 0
  placesWithCoords.forEach(({ pin }) => {
    sumLng += pin.lon
    sumLat += pin.lat
  })

  return [sumLng / placesWithCoords.length, sumLat / placesWithCoords.length]
}
