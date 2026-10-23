import { parseAddressComponents } from '@/lib/address-parser'
import { GOOGLE_PLACES_LANGUAGE } from '@/lib/city-names'
import { usablePin } from '@/lib/place-coords'
import type { BranchCandidate, CitySuggestion, PinDetails } from '@/lib/review/lookup-types'

/**
 * Google Places lookups Review uses for a city suggestion and a branch search.
 *
 * `REVIEW_PLACES_STUB=1` answers from local fixtures and never calls Google.
 * That is the local-verification path. Jest plants `GOOGLE_PLACES_API_KEY=test-api-key`
 * (`jest.setup.js`), which is not a real key and must not leave the machine.
 * A real key, with the stub off, makes exactly one request per call.
 */

export type { BranchCandidate, CitySuggestion, PinDetails } from '@/lib/review/lookup-types'

interface LookupAnswer<T> {
  value: T
  /** True when the lookup could not run. `value` is then empty, not a guess. */
  unavailable: boolean
}

interface AddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface GeocodeResult {
  formatted_address?: string
  types?: string[]
  address_components?: AddressComponent[]
}

const AREA_TYPES = ['park', 'natural_feature', 'neighborhood', 'sublocality', 'point_of_interest', 'tourist_attraction']
const TEST_API_KEY = 'test-api-key'

interface StubPin extends PinDetails {
  queries: string[]
}

const STUB_PINS: StubPin[] = [
  {
    googlePlaceId: 'stub-gails-dulwich',
    name: "Gail's Bakery",
    address: '91 Lordship Ln, London SE22',
    city: 'London',
    admin: 'England',
    country: 'United Kingdom',
    coords: { lat: 51.4496, lon: -0.0763 },
    queries: ['gail'],
  },
  {
    googlePlaceId: 'stub-gails-chelsea',
    name: "Gail's Bakery",
    address: "King's Rd, London SW3",
    city: 'London',
    admin: 'England',
    country: 'United Kingdom',
    coords: { lat: 51.4875, lon: -0.1687 },
    queries: ['gail'],
  },
  {
    googlePlaceId: 'stub-gails-soho',
    name: "Gail's Bakery",
    address: '128 Wardour St, London W1F',
    city: 'London',
    admin: 'England',
    country: 'United Kingdom',
    coords: { lat: 51.5136, lon: -0.134 },
    queries: ['gail'],
  },
  {
    googlePlaceId: 'stub-wow-granvia',
    name: 'WOW Concept',
    address: 'Gran Vía 18, Madrid, Spain',
    city: 'Madrid',
    admin: 'Community of Madrid',
    country: 'Spain',
    coords: { lat: 40.42, lon: -3.702 },
    queries: ['wow'],
  },
  {
    googlePlaceId: 'stub-wow-fuencarral',
    name: 'Wow Concept Store',
    address: 'Calle de Fuencarral 32, Madrid',
    city: 'Madrid',
    admin: 'Community of Madrid',
    country: 'Spain',
    coords: { lat: 40.423, lon: -3.701 },
    queries: ['wow'],
  },
]

function stubCandidate(pin: StubPin): BranchCandidate {
  return { googlePlaceId: pin.googlePlaceId, name: pin.name, detail: pin.address ?? '' }
}

export function reviewPlacesStubEnabled(): boolean {
  return process.env.REVIEW_PLACES_STUB === '1'
}

function liveKey(): string | null {
  if (reviewPlacesStubEnabled()) return null
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || key === TEST_API_KEY) return null
  return key
}

function component(results: GeocodeResult[], type: string): string | null {
  for (const result of results) {
    const hit = result.address_components?.find((entry) => entry.types.includes(type))
    if (hit?.long_name) return hit.long_name
  }
  return null
}

/**
 * Nearest town from a reverse-geocode payload. The town is a locality (or
 * postal town), never the state standing in for one. `areaLabel` is the park
 * or neighborhood on the pin when the payload names one.
 */
export function citySuggestionFromGeocode(results: GeocodeResult[]): CitySuggestion | null {
  if (results.length === 0) return null
  const locality = component(results, 'locality') ?? component(results, 'postal_town')
  const admin = component(results, 'administrative_area_level_1')
  const country = component(results, 'country')
  const area = results.find((result) => result.types?.some((type) => AREA_TYPES.includes(type)))
  const named = area?.address_components?.find((entry) => entry.types.some((type) => AREA_TYPES.includes(type)))?.long_name
  const fromAddress = area?.formatted_address?.split(',')[0]?.trim() || null
  const areaLabel = named || fromAddress
  const suggestion: CitySuggestion = {
    locality,
    admin,
    country,
    areaLabel: areaLabel && areaLabel !== locality ? areaLabel : null,
  }
  if (!suggestion.locality && !suggestion.admin && !suggestion.areaLabel) return null
  return suggestion
}

export function branchesFromAutocomplete(predictions: Array<{
  place_id?: string
  description?: string
  structured_formatting?: { main_text?: string; secondary_text?: string }
}>): BranchCandidate[] {
  const candidates: BranchCandidate[] = []
  for (const prediction of predictions) {
    if (!prediction.place_id) continue
    const name = prediction.structured_formatting?.main_text || prediction.description
    if (!name) continue
    candidates.push({
      googlePlaceId: prediction.place_id,
      name,
      detail: prediction.structured_formatting?.secondary_text || '',
    })
    if (candidates.length === 5) break
  }
  return candidates
}

export function pinFromDetails(result: {
  place_id?: string
  name?: string
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  address_components?: AddressComponent[]
} | null | undefined): PinDetails | null {
  if (!result?.place_id || !result.name) return null
  const parsed = result.address_components
    ? parseAddressComponents(result.address_components, result.formatted_address)
    : null
  const lat = result.geometry?.location?.lat
  const lng = result.geometry?.location?.lng
  const coords = typeof lat === 'number' && typeof lng === 'number' ? usablePin({ lat, lon: lng }) : null
  return {
    googlePlaceId: result.place_id,
    name: result.name,
    address: result.formatted_address ?? parsed?.address ?? null,
    city: parsed?.city ?? null,
    admin: parsed?.admin ?? null,
    country: parsed?.country ?? null,
    coords,
  }
}

function stubCity(coords: { lat: number; lon: number }): CitySuggestion | null {
  // Hall of Mosses sits in this box. Other pins get no invented town.
  if (coords.lat > 47 && coords.lat < 49 && coords.lon < -122 && coords.lon > -125) {
    return {
      locality: 'Forks',
      admin: 'Washington',
      country: 'United States',
      areaLabel: 'Olympic National Park',
    }
  }
  return null
}

function stubBranches(query: string): BranchCandidate[] {
  const folded = query.toLowerCase()
  const matched = STUB_PINS.filter((pin) => pin.queries.some((needle) => folded.includes(needle)))
  if (matched.length > 0) return matched.map(stubCandidate)
  return [{
    googlePlaceId: 'stub-generic',
    name: query.trim(),
    detail: 'Local verification match',
  }]
}

function stubPin(googlePlaceId: string): PinDetails | null {
  const known = STUB_PINS.find((pin) => pin.googlePlaceId === googlePlaceId)
  if (known) {
    const { queries: _queries, ...pin } = known
    return pin
  }
  if (googlePlaceId !== 'stub-generic') return null
  return {
    googlePlaceId,
    name: 'Place',
    address: null,
    city: null,
    admin: null,
    country: null,
    coords: { lat: 51.5074, lon: -0.1278 },
  }
}

async function googleGet<T extends { status?: string }>(url: URL): Promise<T | null> {
  const response = await fetch(url.toString())
  if (!response.ok) return null
  const data = await response.json() as T
  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return null
  return data
}

export async function lookupCityFromPin(coords: { lat: number; lon: number }): Promise<LookupAnswer<CitySuggestion | null>> {
  const pin = usablePin(coords)
  if (!pin) return { value: null, unavailable: false }
  if (reviewPlacesStubEnabled()) return { value: stubCity(pin), unavailable: false }
  const key = liveKey()
  if (!key) return { value: null, unavailable: true }
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('latlng', `${pin.lat},${pin.lon}`)
  url.searchParams.set('language', GOOGLE_PLACES_LANGUAGE)
  url.searchParams.set('key', key)
  try {
    const data = await googleGet<{ status?: string; results?: GeocodeResult[] }>(url)
    if (!data) return { value: null, unavailable: true }
    return { value: citySuggestionFromGeocode(data.results ?? []), unavailable: false }
  } catch {
    return { value: null, unavailable: true }
  }
}

export async function lookupBranches(query: string): Promise<LookupAnswer<BranchCandidate[]>> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return { value: [], unavailable: false }
  if (reviewPlacesStubEnabled()) return { value: stubBranches(trimmed), unavailable: false }
  const key = liveKey()
  if (!key) return { value: [], unavailable: true }
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', trimmed)
  url.searchParams.set('types', 'establishment|geocode')
  url.searchParams.set('language', GOOGLE_PLACES_LANGUAGE)
  url.searchParams.set('key', key)
  try {
    const data = await googleGet<{
      status?: string
      predictions?: Array<{
        place_id?: string
        description?: string
        structured_formatting?: { main_text?: string; secondary_text?: string }
      }>
    }>(url)
    if (!data) return { value: [], unavailable: true }
    return { value: branchesFromAutocomplete(data.predictions ?? []), unavailable: false }
  } catch {
    return { value: [], unavailable: true }
  }
}

export async function lookupPin(googlePlaceId: string): Promise<LookupAnswer<PinDetails | null>> {
  if (reviewPlacesStubEnabled()) return { value: stubPin(googlePlaceId), unavailable: false }
  const key = liveKey()
  if (!key) return { value: null, unavailable: true }
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', googlePlaceId)
  url.searchParams.set('fields', 'place_id,name,formatted_address,geometry,address_components')
  url.searchParams.set('language', GOOGLE_PLACES_LANGUAGE)
  url.searchParams.set('key', key)
  try {
    const data = await googleGet<{ status?: string; result?: Parameters<typeof pinFromDetails>[0] }>(url)
    if (!data) return { value: null, unavailable: true }
    return { value: pinFromDetails(data.result), unavailable: false }
  } catch {
    return { value: null, unavailable: true }
  }
}
