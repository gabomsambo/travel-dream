import { isNullIsland, usablePin } from '@/lib/place-coords'
import { reviewChecks, REVIEW_NAME_CONFIDENCE } from '@/lib/review/review-checks'
import {
  branchesFromAutocomplete,
  citySuggestionFromGeocode,
  lookupBranches,
  lookupCityFromPin,
  lookupPin,
  pinFromDetails,
} from '@/lib/review/places-lookup'

const clean = {
  coords: { lat: 51.5, lon: -0.12 },
  city: 'London',
  confidence: 0.94,
  kind: 'cafe',
}

describe('reviewChecks', () => {
  it('marks nothing when the place has a pin, a city, a sure name, and a real kind', () => {
    expect(reviewChecks(clean)).toEqual([])
  })

  it('marks a missing pin, including a stored 0,0', () => {
    expect(reviewChecks({ ...clean, coords: null })).toEqual(['pin'])
    expect(reviewChecks({ ...clean, coords: { lat: 0, lon: 0 } })).toEqual(['pin'])
    expect(reviewChecks({ ...clean, coords: { lat: 0, lon: -0 } })).toEqual(['pin'])
  })

  it('keeps a real pin on the equator or the prime meridian', () => {
    expect(reviewChecks({ ...clean, coords: { lat: 0, lon: 1 } })).toEqual([])
    expect(reviewChecks({ ...clean, coords: { lat: 1, lon: 0 } })).toEqual([])
  })

  it('marks a missing or blank city', () => {
    expect(reviewChecks({ ...clean, city: null })).toEqual(['city'])
    expect(reviewChecks({ ...clean, city: '   ' })).toEqual(['city'])
  })

  it('marks a name only when confidence is under 0.6', () => {
    expect(REVIEW_NAME_CONFIDENCE).toBe(0.6)
    expect(reviewChecks({ ...clean, confidence: 0.6 })).toEqual([])
    expect(reviewChecks({ ...clean, confidence: 0.599 })).toEqual(['confidence'])
    expect(reviewChecks({ ...clean, confidence: 0 })).toEqual(['confidence'])
    expect(reviewChecks({ ...clean, confidence: null })).toEqual([])
  })

  it('marks a tip even when everything else looks right', () => {
    expect(reviewChecks({ ...clean, kind: 'tip' })).toEqual(['tip'])
  })

  it('returns the four rules in a stable order', () => {
    expect(reviewChecks({
      coords: { lat: 0, lon: 0 },
      city: null,
      confidence: 0.4,
      kind: 'tip',
    })).toEqual(['pin', 'city', 'confidence', 'tip'])
  })
})

describe('usablePin', () => {
  it('drops null island and non-finite coordinates', () => {
    expect(isNullIsland({ lat: 0, lon: 0 })).toBe(true)
    expect(usablePin({ lat: 0, lon: 0 })).toBeNull()
    expect(usablePin({ lat: Number.NaN, lon: 1 })).toBeNull()
    expect(usablePin(null)).toBeNull()
    expect(usablePin({ lat: 47.86, lon: -123.93 })).toEqual({ lat: 47.86, lon: -123.93 })
  })
})

describe('citySuggestionFromGeocode', () => {
  it('reads the nearest town and the park the pin sits in', () => {
    expect(citySuggestionFromGeocode([
      {
        formatted_address: 'Olympic National Park, Forks, WA, USA',
        types: ['park', 'point_of_interest'],
        address_components: [
          { long_name: 'Olympic National Park', short_name: 'Olympic National Park', types: ['park', 'point_of_interest'] },
          { long_name: 'Forks', short_name: 'Forks', types: ['locality', 'political'] },
          { long_name: 'Washington', short_name: 'WA', types: ['administrative_area_level_1', 'political'] },
          { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
        ],
      },
    ])).toEqual({
      locality: 'Forks',
      admin: 'Washington',
      country: 'United States',
      areaLabel: 'Olympic National Park',
    })
  })

  it('returns null when the payload names no place', () => {
    expect(citySuggestionFromGeocode([])).toBeNull()
    expect(citySuggestionFromGeocode([{ types: ['plus_code'], address_components: [] }])).toBeNull()
  })
})

describe('pinFromDetails', () => {
  it('turns a missing or 0,0 geometry into no pin', () => {
    const base = {
      place_id: 'ChIJ_test',
      name: "Gail's Bakery",
      formatted_address: '91 Lordship Ln, London',
      address_components: [
        { long_name: 'London', short_name: 'London', types: ['locality', 'political'] },
        { long_name: 'United Kingdom', short_name: 'GB', types: ['country', 'political'] },
      ],
    }
    expect(pinFromDetails({ ...base })?.coords ?? null).toBeNull()
    expect(pinFromDetails({ ...base, geometry: { location: { lat: 0, lng: 0 } } })?.coords ?? null).toBeNull()
    expect(pinFromDetails({ ...base, geometry: { location: { lat: 51.45, lng: -0.08 } } })?.coords).toEqual({
      lat: 51.45,
      lon: -0.08,
    })
  })
})

describe('branchesFromAutocomplete', () => {
  it('keeps the first five named predictions', () => {
    const predictions = Array.from({ length: 6 }, (_, index) => ({
      place_id: `id-${index}`,
      structured_formatting: { main_text: `Place ${index}`, secondary_text: `Street ${index}` },
    }))
    const candidates = branchesFromAutocomplete(predictions)
    expect(candidates).toHaveLength(5)
    expect(candidates[0]).toEqual({ googlePlaceId: 'id-0', name: 'Place 0', detail: 'Street 0' })
  })
})

describe('places lookup calls', () => {
  const fetchMock = global.fetch as jest.Mock

  beforeEach(() => {
    fetchMock.mockReset()
    delete process.env.REVIEW_PLACES_STUB
    process.env.GOOGLE_PLACES_API_KEY = 'test-api-key'
  })

  it('does not call Google when only the test key is set', async () => {
    const city = await lookupCityFromPin({ lat: 47.86, lon: -123.93 })
    const branches = await lookupBranches("Gail's Bakery, London")
    const pin = await lookupPin('ChIJ_live')
    expect(city).toEqual({ value: null, unavailable: true })
    expect(branches).toEqual({ value: [], unavailable: true })
    expect(pin).toEqual({ value: null, unavailable: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stubs a city and a branch search without calling Google', async () => {
    process.env.REVIEW_PLACES_STUB = '1'
    const city = await lookupCityFromPin({ lat: 47.86, lon: -123.93 })
    const elsewhere = await lookupCityFromPin({ lat: 51.5, lon: -0.12 })
    const branches = await lookupBranches("Gail's Bakery")
    const pin = await lookupPin('stub-gails-dulwich')
    expect(city.value).toMatchObject({ locality: 'Forks', admin: 'Washington', areaLabel: 'Olympic National Park' })
    expect(elsewhere.value).toBeNull()
    expect(branches.value.map((candidate) => candidate.googlePlaceId)).toEqual([
      'stub-gails-dulwich',
      'stub-gails-chelsea',
      'stub-gails-soho',
    ])
    expect(pin.value?.coords).toEqual({ lat: 51.4496, lon: -0.0763 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes one Google call per live lookup', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'live-key'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'OK', predictions: [], results: [], result: { place_id: 'ChIJ_live', name: 'Cafe' } }),
    })
    await lookupBranches('Cafe, London')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await lookupCityFromPin({ lat: 41.1, lon: 2.2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await lookupPin('ChIJ_live')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).toContain('/place/autocomplete/')
    expect(urls[1]).toContain('/geocode/')
    expect(urls[2]).toContain('/place/details/')
    expect(urls.every((url) => url.includes('key=live-key') && url.includes('language=en'))).toBe(true)
  })
})
