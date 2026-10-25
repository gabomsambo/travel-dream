import { getDefaultCenter, placesToGeoJSON } from '@/lib/map-utils'
import type { MapPlace } from '@/types/map'

jest.mock('mapbox-gl', () => ({
  LngLatBounds: class LngLatBounds {
    extend() {
      return this
    }
  },
}))

function mapPlace(id: string, coords: MapPlace['coords']): MapPlace {
  return {
    id,
    name: id,
    kind: 'cafe',
    city: 'London',
    country: 'United Kingdom',
    coords,
  } as MapPlace
}

describe('placesToGeoJSON', () => {
  it('drops a stored 0,0 place and keeps a real pin', () => {
    const places = [
      mapPlace('null-island', { lat: 0, lon: 0 }),
      mapPlace('meridian', { lat: 48.8, lon: 0 }),
      mapPlace('equator', { lat: 0, lon: 9.5 }),
      mapPlace('missing', null),
    ]

    const geo = placesToGeoJSON(places)

    expect(geo.features.map((feature) => feature.properties.id)).toEqual(['meridian', 'equator'])
    expect(geo.features.map((feature) => feature.geometry.coordinates)).toEqual([
      [0, 48.8],
      [9.5, 0],
    ])
    expect(getDefaultCenter(places)).toEqual([(0 + 9.5) / 2, (48.8 + 0) / 2])
    expect(getDefaultCenter([mapPlace('null-island', { lat: 0, lon: 0 })])).toEqual([0, 20])
  })
})
