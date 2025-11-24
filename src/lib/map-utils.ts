import type { MapPlace, PlaceFeatureProperties } from '@/types/map'
import { LngLatBounds } from 'mapbox-gl'

export const KIND_COLORS: Record<string, string> = {
  restaurant: '#f97316',
  cafe: '#f97316',
  bar: '#f97316',

  museum: '#8b5cf6',
  gallery: '#8b5cf6',

  park: '#22c55e',
  beach: '#22c55e',
  natural: '#22c55e',
  viewpoint: '#22c55e',

  hotel: '#3b82f6',
  hostel: '#3b82f6',
  stay: '#3b82f6',

  shop: '#ec4899',
  market: '#ec4899',

  landmark: '#ef4444',
  city: '#ef4444',

  experience: '#10b981',
  tour: '#0ea5e9',
  transit: '#64748b',
  tip: '#94a3b8',
  default: '#64748b',
}

export const DAY_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#8b5cf6',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#6366f1',
]

export function getKindColor(kind: string): string {
  return KIND_COLORS[kind] || KIND_COLORS.default
}

export function getDayColor(dayNumber: number): string {
  return DAY_COLORS[Math.min(dayNumber - 1, DAY_COLORS.length - 1)]
}

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
