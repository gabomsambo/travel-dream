/**
 * Pure helpers for reviewing a multi-place screenshot as one step, and for
 * the sticky trip a batch can file into. Ordering comes from the cached
 * Gemini list (`meta.massUpload.extraction.places`); the join table has no
 * order column. Nothing here reads the database or returns extraction text.
 */

export interface ExtractionOrderPlace {
  id: string
  name: string
  createdAt?: string
}

export interface BatchTripCandidate {
  id: string
  name: string
  cities: string[]
}

/** Place names in Gemini's order. Objects without a name are ignored, so a caption or raw response never becomes queue data. */
export function namesFromPlaces(value: unknown): string[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      parsed = JSON.parse(trimmed) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  const names: string[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const name = (item as { name?: unknown }).name
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (trimmed) names.push(trimmed)
  }
  return names
}

/** `extraction` is the cached Gemini result. Only its `places` names are read. */
export function namesFromExtraction(extraction: unknown): string[] {
  if (!extraction || typeof extraction !== 'object') return []
  return namesFromPlaces((extraction as { places?: unknown }).places)
}

/**
 * Index of each place in the extraction list. Matching is case-insensitive on
 * the name. Two places with the same name take extraction slots in created-at
 * order. Places the list does not name are absent from the map.
 */
export function extractionOrderByPlaceId(
  names: string[],
  places: ExtractionOrderPlace[],
): Map<string, number> {
  const ordered = [...places].sort((a, b) => {
    const byTime = (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    return byTime || a.id.localeCompare(b.id)
  })
  const used = new Set<string>()
  const order = new Map<string, number>()
  names.forEach((name, index) => {
    const key = name.toLowerCase()
    const match = ordered.find((place) => !used.has(place.id) && place.name.trim().toLowerCase() === key)
    if (!match) return
    used.add(match.id)
    order.set(match.id, index)
  })
  return order
}

export function compareExtractionOrder(
  a: { placeId: string; createdAt: string },
  b: { placeId: string; createdAt: string },
  order: Map<string, number>,
): number {
  const ai = order.get(a.placeId)
  const bi = order.get(b.placeId)
  if (ai != null && bi != null && ai !== bi) return ai - bi
  if (ai != null && bi == null) return -1
  if (ai == null && bi != null) return 1
  return a.createdAt.localeCompare(b.createdAt) || a.placeId.localeCompare(b.placeId)
}

/** A real pin. The Gulf of Guinea fallback `{lat:0, lon:0}` counts as no pin. */
export function placeHasPin(coords: { lat?: unknown; lon?: unknown } | null | undefined): boolean {
  if (!coords || typeof coords !== 'object') return false
  const { lat, lon } = coords
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  return !(lat === 0 && lon === 0)
}

/** The post's own words for a group row: one line, capped, from the place description. */
export function reviewQuote(description: string | null | undefined): string | null {
  const text = description?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return null
  if (text.length <= 180) return text
  return `${text.slice(0, 177).trimEnd()}…`
}

export function screenshotTitle(name: string | null | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) return 'This screenshot'
  return trimmed.replace(/\.[a-z0-9]{2,5}$/i, '')
}

export function groupCountLabel(count: number, cities: Array<string | null | undefined>): string {
  const unique = [...new Set(cities.map((city) => city?.trim()).filter((city): city is string => Boolean(city)))]
  const placeWord = count === 1 ? 'place' : 'places'
  if (unique.length === 1) return `${count} ${placeWord} · ${unique[0]}`
  return `${count} ${placeWord}`
}

function cityMentionedIn(tripName: string, city: string): boolean {
  const name = tripName.toLowerCase()
  const needle = city.toLowerCase()
  if (!needle) return false
  let from = 0
  while (from < name.length) {
    const at = name.indexOf(needle, from)
    if (at < 0) return false
    const before = at === 0 || /[\s,./\-–—]/.test(name[at - 1] ?? '')
    const afterIndex = at + needle.length
    const after = afterIndex >= name.length || /[\s,./\-–—]/.test(name[afterIndex] ?? '')
    if (before && after) return true
    from = at + 1
  }
  return false
}

/**
 * The trip to suggest for these places, or null when nothing matches.
 * A single city has to be the strict majority (a tie suggests nothing).
 * A trip matches when its places are already in that city, or its name
 * contains the city on its own. The trip with more places there wins.
 */
export function suggestBatchTrip(
  trips: BatchTripCandidate[],
  placeCities: Array<string | null | undefined>,
): string | null {
  const counts = new Map<string, number>()
  for (const city of placeCities) {
    const key = city?.trim().toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  let top: string | null = null
  let topCount = 0
  let tied = false
  for (const [city, count] of counts) {
    if (count > topCount) {
      top = city
      topCount = count
      tied = false
    } else if (count === topCount) {
      tied = true
    }
  }
  if (!top || tied) return null
  const city = top

  const scored = trips.flatMap((trip) => {
    const inCity = trip.cities.filter((candidate) => candidate.trim().toLowerCase() === city).length
    const nameHit = cityMentionedIn(trip.name, city) ? 1 : 0
    if (inCity === 0 && nameHit === 0) return []
    return [{ id: trip.id, inCity, nameHit }]
  })
  if (scored.length === 0) return null
  scored.sort((a, b) => b.inCity - a.inCity || b.nameHit - a.nameHit || a.id.localeCompare(b.id))
  return scored[0]?.id ?? null
}

/** `choice` null follows the suggestion. `'none'` is an explicit no-trip. A trip id sticks. */
export function resolveBatchTripId(
  choice: string | 'none' | null,
  suggestedId: string | null,
  tripIds: readonly string[],
): string | null {
  if (choice === 'none') return null
  if (choice) return tripIds.includes(choice) ? choice : null
  return suggestedId
}
