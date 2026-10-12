import { createMockPlace } from '@/__tests__/helpers/mass-upload-helpers'
import { citiesMatch } from '@/lib/city-names'
import type { Place } from '@/types/database'
import {
  calculateDuplicateScore,
  calculateLocationDistance,
  calculateNameSimilarity,
  batchDetectDuplicates,
  detectDuplicates,
  DUPLICATE_MAIN_SCORE,
  duplicatePageBand,
  findDuplicateClusters,
  type DuplicateDetectionResult,
  type DuplicateFlag,
  type DuplicatePageBand,
} from '../duplicate-detection'

/**
 * Measured pairs from the duplicates scoring report.
 * Grouping is on main, so a component also drops the weakest edge on a path
 * between two geocoded members more than 2 km apart. The Gail's Wimbledon
 * case covers that split.
 *
 * Two rows differ from the report's proposed column because the 500 m–2 km
 * penalty of 0.05 was accepted after that column was filled: Starbucks at
 * 1.2 km is 0.650 (Possible), and Polar Museum / Polaria at 1.1 km is 0.417 (No).
 */

const PIN = { lat: 38.7223, lon: -9.1393 }
const EARTH_RADIUS_KM = 6371

function atKm(origin: { lat: number; lon: number }, distanceKm: number): { lat: number; lon: number } {
  const angular = distanceKm / EARTH_RADIUS_KM
  const lat1 = (origin.lat * Math.PI) / 180
  const lon1 = (origin.lon * Math.PI) / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular))
  const lon2 = lon1 + Math.atan2(0, Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI }
}

function place(partial: Partial<Place> & { name: string }): Place {
  return createMockPlace(partial)
}

function pinned(
  name: string,
  city: string,
  country: string,
  kind = 'landmark',
  extra: Partial<Place> = {}
): Place {
  return place({ name, city, country, kind, coords: { ...PIN }, ...extra })
}

type ScoreRow = {
  label: string
  a: Place
  b: Place
  score: number
  band: DuplicatePageBand
  flags?: DuplicateFlag[]
  nameScore?: number
}

const romeGeorgia = place({
  name: 'Rome',
  kind: 'city',
  city: 'Rome',
  country: 'United States',
  coords: { lat: 34.257, lon: -85.1647 },
})
const romaItaly = place({
  name: 'Roma',
  kind: 'city',
  city: 'Roma',
  country: 'Italy',
  coords: { lat: 41.9028, lon: 12.4964 },
})
const eiffel = pinned('Eiffel Tower', 'Paris', 'France', 'landmark')
const julesVerne = pinned('Le Jules Verne', 'Paris', 'France', 'restaurant')

const rows: ScoreRow[] = [
  {
    label: 'Same name, 100 m apart',
    a: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: PIN }),
    b: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: atKm(PIN, 0.1) }),
    score: 0.94,
    band: 'Main',
  },
  {
    label: 'Lisbon vs Lisboa, same pin, city strings differ',
    a: pinned('Lisbon', 'Lisbon', 'Portugal'),
    b: pinned('Lisboa', 'Lisboa', 'Portugal'),
    score: 1,
    band: 'Main',
    nameScore: 1,
  },
  {
    label: 'Rome vs Roma, same pin',
    a: pinned('Rome', 'Rome', 'Italy'),
    b: pinned('Roma', 'Roma', 'Italy'),
    score: 0.9,
    band: 'Main',
    nameScore: 0.75,
  },
  {
    label: 'Florence vs Firenze, same pin',
    a: pinned('Florence', 'Florence', 'Italy'),
    b: pinned('Firenze', 'Firenze', 'Italy'),
    score: 0.85,
    band: 'Main',
  },
  {
    label: 'Vienna vs Wien, same pin',
    a: pinned('Vienna', 'Vienna', 'Austria'),
    b: pinned('Wien', 'Wien', 'Austria'),
    score: 0.8,
    band: 'Main',
  },
  {
    label: 'Sé de Lisboa vs Lisbon Cathedral, 15 m',
    a: place({ name: 'Sé de Lisboa', kind: 'landmark', city: 'Lisboa', country: 'Portugal', coords: PIN }),
    b: place({
      name: 'Lisbon Cathedral',
      kind: 'landmark',
      city: 'Lisbon',
      country: 'Portugal',
      coords: atKm(PIN, 0.015),
    }),
    score: 0.791,
    band: 'Main',
    nameScore: 0.5,
  },
  {
    label: 'Sé de Lisboa vs Lisbon Cathedral, identical pin',
    a: pinned('Sé de Lisboa', 'Lisboa', 'Portugal'),
    b: pinned('Lisbon Cathedral', 'Lisbon', 'Portugal'),
    score: 0.8,
    band: 'Main',
    nameScore: 0.5,
  },
  {
    label: 'Kölner Dom vs Cologne Cathedral, same pin',
    a: pinned('Kölner Dom', 'Köln', 'Germany'),
    b: pinned('Cologne Cathedral', 'Cologne', 'Germany'),
    score: 0.68,
    band: 'Possible',
    flags: ['same spot, different name'],
  },
  {
    label: 'Iguazu Falls vs Iguazu Falls, Brasil, same pin',
    a: pinned('Iguazu Falls', 'Puerto Iguazu', 'Argentina'),
    b: pinned('Iguazu Falls, Brasil', 'Puerto Iguazu', 'Argentina'),
    score: 0.92,
    band: 'Main',
  },
  {
    label: 'Iguazu Falls vs Iguaçu Falls, same pin',
    a: pinned('Iguazu Falls', 'Puerto Iguazu', 'Argentina'),
    b: pinned('Iguaçu Falls', 'Puerto Iguazu', 'Argentina'),
    score: 1,
    band: 'Main',
    nameScore: 1,
  },
  {
    label: 'Iguazu Falls vs Cataratas do Iguaçu, different city and country',
    a: pinned('Iguazu Falls', 'Puerto Iguazu', 'Argentina'),
    b: pinned('Cataratas do Iguaçu', 'Foz do Iguaçu', 'Brazil'),
    score: 0.61,
    band: 'Possible',
    flags: ['same spot, different name'],
  },
  {
    label: 'Cataratas do Iguaçu vs Cataratas del Iguazú, same pin',
    a: pinned('Cataratas do Iguaçu', 'Foz do Iguaçu', 'Brazil'),
    b: pinned('Cataratas del Iguazú', 'Puerto Iguazu', 'Argentina'),
    score: 0.79,
    band: 'Main',
  },
  {
    label: 'Two Starbucks, same city, 3.0 km',
    a: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: PIN }),
    b: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: atKm(PIN, 3) }),
    score: 0.58,
    band: 'No',
    flags: ['far apart'],
  },
  {
    label: 'Two Starbucks, Lisbon vs Porto',
    a: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: PIN }),
    b: place({ name: 'Starbucks', kind: 'cafe', city: 'Porto', country: 'Portugal', coords: atKm(PIN, 300) }),
    score: 0.48,
    band: 'No',
    flags: ['far apart'],
  },
  {
    label: 'Louvre vs Louvre Museum Shop, 80 m, museum vs shop',
    a: place({ name: 'Louvre', kind: 'museum', city: 'Paris', country: 'France', coords: PIN }),
    b: place({ name: 'Louvre Museum Shop', kind: 'shop', city: 'Paris', country: 'France', coords: atKm(PIN, 0.08) }),
    score: 0.602,
    band: 'Possible',
  },
  {
    label: 'Eiffel Tower vs Le Jules Verne, same pin, landmark vs restaurant',
    a: eiffel,
    b: julesVerne,
    score: 0.517,
    band: 'No',
  },
  {
    label: 'Secret Beach vs Harris Beach, no pin, no city, no country',
    a: place({ name: 'Secret Beach', kind: 'beach', city: null, country: null, coords: null }),
    b: place({ name: 'Harris Beach', kind: 'beach', city: null, country: null, coords: null }),
    score: 0.592,
    band: 'No',
  },
  {
    label: 'Mercado Municipal, São Paulo vs Sao Paulo, same pin',
    a: pinned('Mercado Municipal', 'São Paulo', 'Brazil', 'market'),
    b: pinned('Mercado Municipal', 'Sao Paulo', 'Brazil', 'market'),
    score: 1,
    band: 'Main',
  },
  {
    label: 'Secret vs Harris, no city, both country United States',
    a: place({ name: 'Secret Beach', kind: 'beach', city: null, country: 'United States', coords: null }),
    b: place({ name: 'Harris Beach', kind: 'beach', city: null, country: 'United States', coords: null }),
    score: 0.65,
    band: 'Possible',
  },
  {
    label: 'Secret vs Harris, both city Brookings, no pin',
    a: place({ name: 'Secret Beach', kind: 'beach', city: 'Brookings', country: 'United States', coords: null }),
    b: place({ name: 'Harris Beach', kind: 'beach', city: 'Brookings', country: 'United States', coords: null }),
    score: 0.762,
    band: 'Main',
  },
  {
    label: 'Mercado, São Paulo vs Sao Paulo, no pin',
    a: place({ name: 'Mercado Municipal', kind: 'market', city: 'São Paulo', country: 'Brazil', coords: null }),
    b: place({ name: 'Mercado Municipal', kind: 'market', city: 'Sao Paulo', country: 'Brazil', coords: null }),
    score: 1,
    band: 'Main',
  },
  {
    label: 'Same Google place id, different name, 1.8 km, different city and country',
    a: place({
      name: 'Iguazu Falls',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      coords: PIN,
      googlePlaceId: 'ChIJ_same',
    }),
    b: place({
      name: 'Cataratas do Iguaçu',
      kind: 'landmark',
      city: 'Foz do Iguaçu',
      country: 'Brazil',
      coords: atKm(PIN, 1.8),
      googlePlaceId: 'ChIJ_same',
    }),
    score: 1,
    band: 'Main',
    flags: ['same Google place'],
  },
  {
    label: 'Two Starbucks, same city, 1.2 km',
    a: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: PIN }),
    b: place({ name: 'Starbucks', kind: 'cafe', city: 'Lisbon', country: 'Portugal', coords: atKm(PIN, 1.2) }),
    score: 0.65,
    band: 'Possible',
  },
  {
    label: 'Rome, Georgia vs Roma, Italy',
    a: romeGeorgia,
    b: romaItaly,
    score: 0.33,
    band: 'No',
    flags: ['far apart'],
  },
  {
    label: 'After a merge: Iguazu Falls with alt name vs Cataratas do Iguaçu Parque, 40 m',
    a: place({
      name: 'Iguazu Falls',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      coords: PIN,
      altNames: ['Cataratas do Iguaçu'],
    }),
    b: place({
      name: 'Cataratas do Iguaçu Parque',
      kind: 'landmark',
      city: 'Foz do Iguaçu',
      country: 'Brazil',
      coords: atKm(PIN, 0.04),
    }),
    score: 0.769,
    band: 'Main',
  },
  {
    label: 'That same new place with the alt names wiped',
    a: place({
      name: 'Iguazu Falls',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      coords: PIN,
      altNames: [],
    }),
    b: place({
      name: 'Cataratas do Iguaçu Parque',
      kind: 'landmark',
      city: 'Foz do Iguaçu',
      country: 'Brazil',
      coords: atKm(PIN, 0.04),
    }),
    score: 0.559,
    band: 'Possible',
    flags: ['same spot, different name'],
  },
  {
    label: 'Fjellheisen Cable Car ↔ Fjellheisen (54 m)',
    a: place({
      name: 'Fjellheisen Cable Car',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6327, lon: 18.9853 },
    }),
    b: place({
      name: 'Fjellheisen',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6331, lon: 18.9861 },
    }),
    score: 0.777,
    band: 'Main',
  },
  {
    label: 'Fjellheisen Cable Car ↔ Fjellheisen cable car (no pin, no city)',
    a: place({
      name: 'Fjellheisen Cable Car',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6327, lon: 18.9853 },
    }),
    b: place({ name: 'Fjellheisen cable car', kind: 'attraction', city: null, country: 'Norway', coords: null }),
    score: 0.9,
    band: 'Main',
  },
  {
    label: 'Fjellheisen ↔ Fjellheisen cable car',
    a: place({
      name: 'Fjellheisen',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6331, lon: 18.9861 },
    }),
    b: place({ name: 'Fjellheisen cable car', kind: 'attraction', city: null, country: 'Norway', coords: null }),
    score: 0.614,
    band: 'Possible',
  },
  {
    label: 'Arctic Cathedral ↔ Ishavskatedralen (32 m, alt name)',
    a: place({
      name: 'Arctic Cathedral',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6481, lon: 18.9871 },
    }),
    b: place({
      name: 'Ishavskatedralen',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      altNames: ['Arctic Cathedral'],
      coords: { lat: 69.6479, lon: 18.9877 },
    }),
    score: 0.981,
    band: 'Main',
  },
  {
    label: 'My Old Dutch ↔ Old Dutch (restaurant vs cafe, no pin)',
    a: place({ name: 'My Old Dutch Pancake House', kind: 'restaurant', city: 'London', country: 'United Kingdom', coords: null }),
    b: place({ name: 'Old Dutch Pancake House', kind: 'cafe', city: 'London', country: 'United Kingdom', coords: null }),
    score: 0.786,
    band: 'Main',
  },
  {
    label: 'PR8 ↔ Vereda da Ponta de São Lourenço (195 m)',
    a: place({
      name: 'PR8 Vereda da Ponta de São Lourenço',
      kind: 'hike',
      city: 'Caniçal',
      country: 'Portugal',
      coords: { lat: 32.7436, lon: -16.7032 },
    }),
    b: place({
      name: 'Vereda da Ponta de São Lourenço',
      kind: 'hike',
      city: 'Caniçal',
      country: 'Portugal',
      coords: { lat: 32.7441, lon: -16.7012 },
    }),
    score: 0.852,
    band: 'Main',
  },
  {
    label: "Gail's Bakery ↔ GAIL's Bakery Dulwich (30 m)",
    a: place({ name: "Gail's Bakery", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4613, lon: -0.086 } }),
    b: place({ name: "GAIL's Bakery Dulwich", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4615, lon: -0.0857 } }),
    score: 0.902,
    band: 'Main',
  },
  {
    label: "Gail's Bakery ↔ Gails (Gails has no pin)",
    a: place({ name: "Gail's Bakery", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4613, lon: -0.086 } }),
    b: place({ name: 'Gails', kind: 'cafe', city: 'London', country: 'United Kingdom', coords: null }),
    score: 0.81,
    band: 'Main',
  },
  {
    label: "Gail's Bakery ↔ Gail's Bakery Wimbledon (9.5 km)",
    a: place({ name: "Gail's Bakery", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4613, lon: -0.086 } }),
    b: place({ name: "Gail's Bakery Wimbledon", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4214, lon: -0.2064 } }),
    score: 0.5,
    band: 'No',
    flags: ['far apart'],
  },
  {
    label: "GAIL's Bakery Dulwich ↔ Gails",
    a: place({ name: "GAIL's Bakery Dulwich", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4615, lon: -0.0857 } }),
    b: place({ name: 'Gails', kind: 'cafe', city: 'London', country: 'United Kingdom', coords: null }),
    score: 0.714,
    band: 'Main',
  },
  {
    label: "GAIL's Bakery Dulwich ↔ Wimbledon (9.5 km)",
    a: place({ name: "GAIL's Bakery Dulwich", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4615, lon: -0.0857 } }),
    b: place({ name: "Gail's Bakery Wimbledon", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4214, lon: -0.2064 } }),
    score: 0.447,
    band: 'No',
    flags: ['far apart'],
  },
  {
    label: 'Gails ↔ Wimbledon (Gails has no pin, so no distance)',
    a: place({ name: 'Gails', kind: 'cafe', city: 'London', country: 'United Kingdom', coords: null }),
    b: place({ name: "Gail's Bakery Wimbledon", kind: 'cafe', city: 'London', country: 'United Kingdom', coords: { lat: 51.4214, lon: -0.2064 } }),
    score: 0.714,
    band: 'Main',
  },
  {
    label: 'Fushimi Inari Taisha ↔ Fushimi Inari Shrine',
    a: place({
      name: 'Fushimi Inari Taisha',
      kind: 'attraction',
      city: 'Kyoto',
      country: 'Japan',
      coords: { lat: 34.9671, lon: 135.7727 },
    }),
    b: place({ name: 'Fushimi Inari Shrine', kind: 'attraction', city: null, country: null, coords: null }),
    score: 0.665,
    band: 'Possible',
  },
  {
    label: 'Café Central, Vienna vs Madrid, no pins',
    a: place({ name: 'Café Central', kind: 'cafe', city: 'Vienna', country: 'Austria', coords: null }),
    b: place({ name: 'Café Central', kind: 'cafe', city: 'Madrid', country: 'Spain', coords: null }),
    score: 0.55,
    band: 'No',
  },
  {
    label: 'Sushi Saito ↔ Sushi Sato, no pins',
    a: place({ name: 'Sushi Saito', kind: 'restaurant', city: 'Tokyo', country: 'Japan', coords: null }),
    b: place({ name: 'Sushi Sato', kind: 'restaurant', city: 'Tokyo', country: 'Japan', coords: null }),
    score: 0.948,
    band: 'Main',
  },
  {
    label: 'Polar Museum ↔ Polaria (1.1 km)',
    a: place({ name: 'Polar Museum', kind: 'museum', city: 'Tromsø', country: 'Norway', coords: { lat: 69.6519, lon: 18.9628 } }),
    b: place({ name: 'Polaria', kind: 'museum', city: 'Tromsø', country: 'Norway', coords: { lat: 69.6434, lon: 18.9478 } }),
    score: 0.417,
    band: 'No',
  },
]

describe('duplicate score table', () => {
  test.each(rows)('$label', (row) => {
    const { score, factors, flags } = calculateDuplicateScore(row.a, row.b)
    expect(Math.abs(score - row.score)).toBeLessThanOrEqual(0.005)
    expect(duplicatePageBand(score, flags)).toBe(row.band)
    expect(flags).toEqual(row.flags ?? [])
    if (row.nameScore !== undefined) {
      expect(factors.nameScore).toBe(row.nameScore)
    }
  })

  it('keeps one-letter name matches perfect and leaves Rome/Roma under the word threshold', () => {
    expect(calculateNameSimilarity('Lisbon', 'Lisboa')).toBe(1)
    expect(calculateNameSimilarity('Iguazu Falls', 'Iguaçu Falls')).toBe(1)
    expect(calculateNameSimilarity('Rome', 'Roma')).toBe(0.75)
  })

  it('keeps Rome, Georgia off the page against Roma, Italy', () => {
    const { score, factors, flags } = calculateDuplicateScore(romeGeorgia, romaItaly)
    expect(factors.cityMatch).toBe(false)
    expect(score).toBeLessThan(0.6)
    expect(duplicatePageBand(score, flags)).toBe('No')
  })

  it('keeps Eiffel Tower off the page against Le Jules Verne', () => {
    const { score, flags } = calculateDuplicateScore(eiffel, julesVerne)
    expect(flags).not.toContain('same spot, different name')
    expect(score).toBeLessThan(0.6)
    expect(duplicatePageBand(score, flags)).toBe('No')
  })

  it('does not let the same-spot flag raise a pair into the main queue', () => {
    const wiped = rows.find((row) => row.label.startsWith('That same new place'))
    expect(wiped).toBeDefined()
    const { score, flags } = calculateDuplicateScore(wiped!.a, wiped!.b)
    expect(score).toBeLessThan(0.6)
    expect(flags).toContain('same spot, different name')
    expect(duplicatePageBand(score, flags)).toBe('Possible')

    const detected = detectDuplicates(wiped!.a, [wiped!.a, wiped!.b])
    expect(detected.potentialDuplicates).toHaveLength(1)
    expect(detected.potentialDuplicates[0].confidence).toBeLessThan(0.6)

    const clusters = findDuplicateClusters(
      new Map([[wiped!.a.id, detected]]),
      2,
      0.7
    )
    expect(clusters).toHaveLength(0)
  })

  it('does not apply a distance penalty on top of a same Google place id', () => {
    const google = rows.find((row) => row.label.startsWith('Same Google place'))
    expect(google).toBeDefined()
    const { score, flags } = calculateDuplicateScore(google!.a, google!.b)
    expect(score).toBe(1)
    expect(flags).toEqual(['same Google place'])
  })

  it('does not count a blank city as the same city', () => {
    const secret = rows.find((row) => row.label.startsWith('Secret Beach vs Harris Beach, no pin'))
    expect(secret).toBeDefined()
    const { factors } = calculateDuplicateScore(secret!.a, secret!.b)
    expect(factors.cityMatch).toBe(false)
    expect(factors.countryMatch).toBe(false)
  })

  it('keeps Hotel Astra Suites and Hotel Zenith in Possible and out of the main queue', () => {
    const a = pinned('Hotel Astra Suites', 'Lisbon', 'Portugal', 'hotel')
    const b = pinned('Hotel Zenith', 'Lisbon', 'Portugal', 'hotel')
    const { score, factors, flags } = calculateDuplicateScore(a, b)

    expect(factors.nameScore).toBeLessThan(0.5)
    expect(flags).toContain('same spot, different name')
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_MAIN_SCORE)
    expect(duplicatePageBand(score, flags)).toBe('Possible')

    const detected = detectDuplicates(a, [a, b])
    expect(detected.potentialDuplicates).toHaveLength(1)
    const clusters = findDuplicateClusters(
      new Map([[a.id, detected]]),
      2,
      DUPLICATE_MAIN_SCORE,
    )
    expect(clusters).toHaveLength(0)
  })

  it('keeps the Hotel Astra / Zenith trio in one main-queue group in every input order', async () => {
    const astra = pinned('Hotel Astra Suites', 'Lisbon', 'Portugal', 'hotel', { id: 'astra' })
    const zenith = pinned('Hotel Zenith', 'Lisbon', 'Portugal', 'hotel', { id: 'zenith-pin' })
    const zenithAway = pinned('Hotel Zenith', 'Lisbon', 'Portugal', 'hotel', {
      id: 'zenith-away',
      coords: atKm(PIN, 0.1),
    })

    const sameSpot = calculateDuplicateScore(astra, zenith)
    const astraToAway = calculateDuplicateScore(astra, zenithAway)
    const zenithToAway = calculateDuplicateScore(zenith, zenithAway)

    expect(sameSpot.factors.nameScore).toBeLessThan(0.5)
    expect(sameSpot.flags).toContain('same spot, different name')
    expect(duplicatePageBand(sameSpot.score, sameSpot.flags)).toBe('Possible')
    expect(astraToAway.flags).not.toContain('same spot, different name')
    expect(duplicatePageBand(astraToAway.score, astraToAway.flags)).toBe('Main')
    expect(duplicatePageBand(zenithToAway.score, zenithToAway.flags)).toBe('Main')

    const orders = [
      [astra, zenith, zenithAway],
      [astra, zenithAway, zenith],
      [zenith, astra, zenithAway],
      [zenith, zenithAway, astra],
      [zenithAway, astra, zenith],
      [zenithAway, zenith, astra],
    ]
    const expectedIds = ['astra', 'zenith-away', 'zenith-pin']
    const mainAverage = (astraToAway.score + zenithToAway.score) / 2

    for (const order of orders) {
      const results = await batchDetectDuplicates(order)
      const clusters = findDuplicateClusters(results, 2, DUPLICATE_MAIN_SCORE)
      expect(clusters).toHaveLength(1)
      expect(clusters[0].places.map((place) => place.id)).toEqual(expectedIds)
      expect(clusters[0].avgConfidence).toBeCloseTo(mainAverage, 5)
    }
  })

  it('keeps Sé de Lisboa and Lisbon Cathedral in the main queue at a name score of 0.5', () => {
    const row = rows.find((entry) => entry.label === 'Sé de Lisboa vs Lisbon Cathedral, identical pin')
    expect(row).toBeDefined()
    const { score, factors, flags } = calculateDuplicateScore(row!.a, row!.b)

    expect(factors.nameScore).toBe(0.5)
    expect(flags).not.toContain('same spot, different name')
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_MAIN_SCORE)
    expect(duplicatePageBand(score, flags)).toBe('Main')

    const detected = detectDuplicates(row!.a, [row!.a, row!.b])
    const clusters = findDuplicateClusters(
      new Map([[row!.a.id, detected]]),
      2,
      DUPLICATE_MAIN_SCORE,
    )
    expect(clusters).toHaveLength(1)
  })

  it('scores an exact stored alternate name like the same primary name when coordinates are missing', () => {
    const shared = { kind: 'beach' as const, city: null, country: null, coords: null }
    const byAlt = calculateDuplicateScore(
      place({ name: 'X', altNames: ['Secret Beach'], ...shared }),
      place({ name: 'Secret Beach', ...shared }),
    )
    const byPrimary = calculateDuplicateScore(
      place({ name: 'Secret Beach', ...shared }),
      place({ name: 'Secret Beach', ...shared }),
    )

    expect(byAlt.factors.nameScore).toBe(1)
    expect(byPrimary.factors.nameScore).toBe(1)
    expect(byAlt.score).toBe(byPrimary.score)
    expect(byAlt.score).toBeGreaterThanOrEqual(DUPLICATE_MAIN_SCORE)
    expect(duplicatePageBand(byAlt.score, byAlt.flags)).toBe('Main')
    expect(duplicatePageBand(byPrimary.score, byPrimary.flags)).toBe('Main')
  })

  it('uses citiesMatch for the city factor and withholds it when the country differs', () => {
    const lisbon = calculateDuplicateScore(
      pinned('Lisbon', 'Lisbon', 'Portugal'),
      pinned('Lisboa', 'Lisboa', 'Portugal'),
    )
    expect(citiesMatch('Lisbon', 'Lisboa')).toBe(true)
    expect(lisbon.factors.cityMatch).toBe(citiesMatch('Lisbon', 'Lisboa'))

    const rome = calculateDuplicateScore(romeGeorgia, romaItaly)
    expect(citiesMatch('Rome', 'Roma')).toBe(true)
    expect(rome.factors.cityMatch).toBe(false)
  })

  it('folds country case and space into the city scope and keeps two blank countries together', () => {
    const noCoords = { kind: 'landmark' as const, coords: null }
    const matching = calculateDuplicateScore(
      place({ name: 'Lisbon', city: 'Lisbon', country: 'Portugal', ...noCoords }),
      place({ name: 'Lisboa', city: 'Lisboa', country: 'Portugal', ...noCoords }),
    )
    const caseFold = calculateDuplicateScore(
      place({ name: 'Lisbon', city: 'Lisbon', country: 'Portugal', ...noCoords }),
      place({ name: 'Lisboa', city: 'Lisboa', country: 'portugal', ...noCoords }),
    )
    const spaced = calculateDuplicateScore(
      place({ name: 'Lisbon', city: 'Lisbon', country: 'Portugal', ...noCoords }),
      place({ name: 'Lisboa', city: 'Lisboa', country: 'Portugal ', ...noCoords }),
    )

    expect(caseFold.factors.cityMatch).toBe(true)
    expect(caseFold.factors.countryMatch).toBe(true)
    expect(spaced.factors.cityMatch).toBe(true)
    expect(spaced.factors.countryMatch).toBe(true)
    expect(caseFold.score).toBeCloseTo(matching.score, 5)
    expect(spaced.score).toBeCloseTo(matching.score, 5)
    expect(caseFold.score).toBeCloseTo(1, 5)
    expect(duplicatePageBand(caseFold.score, caseFold.flags)).toBe('Main')
    expect(duplicatePageBand(spaced.score, spaced.flags)).toBe('Main')

    const blanks = calculateDuplicateScore(
      place({ name: 'Lisbon', city: 'Lisbon', country: null, ...noCoords }),
      place({ name: 'Lisboa', city: 'Lisboa', country: '   ', ...noCoords }),
    )
    expect(blanks.factors.cityMatch).toBe(true)
    expect(blanks.factors.countryMatch).toBe(false)

    const rome = calculateDuplicateScore(romeGeorgia, romaItaly)
    expect(rome.factors.cityMatch).toBe(false)
    expect(duplicatePageBand(rome.score, rome.flags)).toBe('No')
  })

  it('drops the unpinned bridge that pulls Gail\'s Wimbledon into the Dulwich group', async () => {
    const bakery = place({
      id: 'plc_gail_1',
      name: "Gail's Bakery",
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: { lat: 51.4613, lon: -0.0860 },
    })
    const dulwich = place({
      id: 'plc_gail_2',
      name: "GAIL's Bakery Dulwich",
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: { lat: 51.4615, lon: -0.0857 },
    })
    const gails = place({
      id: 'plc_gail_3',
      name: 'Gails',
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: null,
    })
    const wimbledon = place({
      id: 'plc_gail_4',
      name: "Gail's Bakery Wimbledon",
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: { lat: 51.4214, lon: -0.2064 },
    })

    const bridge = calculateDuplicateScore(gails, wimbledon)
    expect(duplicatePageBand(bridge.score, bridge.flags)).toBe('Main')
    const direct = calculateDuplicateScore(bakery, wimbledon)
    expect(duplicatePageBand(direct.score, direct.flags)).toBe('No')

    const orders = permutations([bakery, dulwich, gails, wimbledon])
    expect(orders).toHaveLength(24)
    for (const order of orders) {
      const clusters = findDuplicateClusters(
        await batchDetectDuplicates(order),
        2,
        DUPLICATE_MAIN_SCORE,
      )
      expect(clusters).toHaveLength(1)
      expect(clusters[0].id).toBe('plc_gail_1+plc_gail_2+plc_gail_3')
      expect(clusters[0].places.map((item) => item.id)).toEqual([
        'plc_gail_1',
        'plc_gail_2',
        'plc_gail_3',
      ])
      expect(clusters[0].leftOut).toEqual([
        {
          id: 'plc_gail_4',
          name: "Gail's Bakery Wimbledon",
          distanceM: 9451,
          fromId: 'plc_gail_1',
          reason: '9.5 km apart',
        },
      ])
    }

    const unpinnedPair = findDuplicateClusters(
      await batchDetectDuplicates([gails, wimbledon]),
      2,
      DUPLICATE_MAIN_SCORE,
    )
    expect(unpinnedPair).toHaveLength(1)
    expect(unpinnedPair[0].places.map((item) => item.id).sort()).toEqual([
      'plc_gail_3',
      'plc_gail_4',
    ])
    expect(unpinnedPair[0].leftOut).toEqual([])
  })

  it('drops Gail\'s Wimbledon when two unpinned aliases each keep a path to it', async () => {
    const bakery = place({
      id: 'plc_gail_1',
      name: "Gail's Bakery",
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: { lat: 51.4613, lon: -0.0860 },
    })
    const dulwich = place({
      id: 'plc_gail_2',
      name: "GAIL's Bakery Dulwich",
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: { lat: 51.4615, lon: -0.0857 },
    })
    const aliasA = place({
      id: 'plc_gail_3',
      name: 'Gails',
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: null,
    })
    const wimbledon = place({
      id: 'plc_gail_4',
      name: "Gail's Bakery Wimbledon",
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: { lat: 51.4214, lon: -0.2064 },
    })
    const aliasB = place({
      id: 'plc_gail_5',
      name: 'Gails',
      kind: 'cafe',
      city: 'London',
      country: 'United Kingdom',
      coords: null,
    })

    for (const alias of [aliasA, aliasB]) {
      for (const other of [bakery, dulwich, wimbledon]) {
        const scored = calculateDuplicateScore(alias, other)
        expect(duplicatePageBand(scored.score, scored.flags)).toBe('Main')
      }
    }
    const aliases = calculateDuplicateScore(aliasA, aliasB)
    expect(duplicatePageBand(aliases.score, aliases.flags)).toBe('Main')

    const orders = permutations([bakery, dulwich, aliasA, aliasB, wimbledon])
    expect(orders).toHaveLength(120)
    for (const order of orders) {
      const clusters = findDuplicateClusters(
        await batchDetectDuplicates(order),
        2,
        DUPLICATE_MAIN_SCORE,
      )
      expect(clusters).toHaveLength(1)
      expect(clusters[0].id).toBe('plc_gail_1+plc_gail_2+plc_gail_3+plc_gail_5')
      expect(clusters[0].places.map((item) => item.id)).toEqual([
        'plc_gail_1',
        'plc_gail_2',
        'plc_gail_3',
        'plc_gail_5',
      ])
      expect(clusters[0].leftOut).toEqual([
        {
          id: 'plc_gail_4',
          name: "Gail's Bakery Wimbledon",
          distanceM: 9451,
          fromId: 'plc_gail_1',
          reason: '9.5 km apart',
        },
      ])
    }
  })

  it('keeps a same Google place together when the pins are more than 2 km apart', () => {
    const a = pinned('Iguazu Falls', 'Puerto Iguazu', 'Argentina', 'landmark', {
      id: 'google-a',
      googlePlaceId: 'ChIJ_far',
    })
    const b = pinned('Cataratas do Iguaçu', 'Foz do Iguaçu', 'Brazil', 'landmark', {
      id: 'google-b',
      googlePlaceId: 'ChIJ_far',
      coords: atKm(PIN, 3),
    })
    const { score, flags } = calculateDuplicateScore(a, b)
    expect(score).toBe(1)
    expect(flags).toContain('same Google place')

    const detected = detectDuplicates(a, [a, b])
    const clusters = findDuplicateClusters(
      new Map([[a.id, detected]]),
      2,
      DUPLICATE_MAIN_SCORE,
    )
    expect(clusters).toHaveLength(1)
    expect(clusters[0].places.map((item) => item.id).sort()).toEqual(['google-a', 'google-b'])
    expect(clusters[0].leftOut).toEqual([])
  })

  it('attributes a removed place to the nearer survivor, not the first edge reached', () => {
    const nearPin = PIN
    const removedPin = atKm(PIN, 2.5)
    const farPin = atKm(PIN, 8)
    const nearA = place({ id: 'near-a', name: 'Cafe North', coords: nearPin })
    const nearB = place({ id: 'near-b', name: 'Cafe North', coords: nearPin })
    const farA = place({ id: 'far-a', name: 'Cafe North', coords: farPin })
    const farB = place({ id: 'far-b', name: 'Cafe North', coords: farPin })
    const removed = place({ id: 'removed', name: 'Cafe North', coords: removedPin })
    const places = [removed, nearA, nearB, farA, farB]
    const nearer = apart(removedPin, nearPin)

    for (const bridges of [
      [['removed', 'far-a', 0.8], ['removed', 'near-a', 0.8]] as const,
      [['removed', 'near-a', 0.8], ['removed', 'far-a', 0.8]] as const,
    ]) {
      const clusters = findDuplicateClusters(
        detectionMap(places, [
          ...bridges,
          ['near-a', 'near-b', 0.95],
          ['far-a', 'far-b', 0.95],
        ]),
        2,
        0.6,
      )
      expect(clusters.map((cluster) => cluster.id).sort()).toEqual([
        'far-a+far-b',
        'near-a+near-b',
      ])
      expect(clusters.find((cluster) => cluster.id === 'far-a+far-b')?.leftOut).toEqual([])
      expect(clusters.find((cluster) => cluster.id === 'near-a+near-b')?.leftOut).toEqual([
        {
          id: 'removed',
          name: 'Cafe North',
          distanceM: nearer.distanceM,
          fromId: 'near-a',
          reason: nearer.reason,
        },
      ])
    }
  })

  it('breaks an equal left-out distance by survivor group id', () => {
    const there = atKm(PIN, 3)
    const aaa1 = place({ id: 'aaa-1', name: 'Cafe', coords: there })
    const aaa2 = place({ id: 'aaa-2', name: 'Cafe', coords: there })
    const zzz1 = place({ id: 'zzz-1', name: 'Cafe', coords: there })
    const zzz2 = place({ id: 'zzz-2', name: 'Cafe', coords: there })
    const removed = place({ id: 'removed', name: 'Cafe', coords: PIN })
    const places = [removed, aaa1, aaa2, zzz1, zzz2]
    const distance = apart(PIN, there)

    for (const bridges of [
      [['removed', 'zzz-1', 0.8], ['removed', 'aaa-1', 0.8]] as const,
      [['removed', 'aaa-1', 0.8], ['removed', 'zzz-1', 0.8]] as const,
    ]) {
      const clusters = findDuplicateClusters(
        detectionMap(places, [
          ...bridges,
          ['aaa-1', 'aaa-2', 0.95],
          ['zzz-1', 'zzz-2', 0.95],
        ]),
        2,
        0.6,
      )
      expect(clusters.map((cluster) => cluster.id).sort()).toEqual([
        'aaa-1+aaa-2',
        'zzz-1+zzz-2',
      ])
      expect(clusters.find((cluster) => cluster.id === 'zzz-1+zzz-2')?.leftOut).toEqual([])
      expect(clusters.find((cluster) => cluster.id === 'aaa-1+aaa-2')?.leftOut).toEqual([
        {
          id: 'removed',
          name: 'Cafe',
          distanceM: distance.distanceM,
          fromId: 'aaa-1',
          reason: distance.reason,
        },
      ])
    }
  })
})

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = items.filter((_, index) => index !== i)
    for (const perm of permutations(rest)) out.push([items[i], ...perm])
  }
  return out
}

function apart(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): { distanceM: number; reason: string } {
  const metres = calculateLocationDistance(from, to) * 1000
  const reason = metres > 2000
    ? `${(metres / 1000).toFixed(1)} km apart`
    : `${Math.round(metres)} m apart`
  return { distanceM: Math.round(metres), reason }
}

function detectionMap(
  places: Place[],
  edges: ReadonlyArray<readonly [string, string, number]>,
): Map<string, DuplicateDetectionResult> {
  const byId = new Map(places.map((item) => [item.id, item]))
  const outgoing = new Map<string, Array<{ id: string; score: number }>>()
  for (const item of places) outgoing.set(item.id, [])
  for (const [from, to, score] of edges) {
    const list = outgoing.get(from)
    if (!list || !byId.has(to)) throw new Error(`missing ${from} or ${to}`)
    list.push({ id: to, score })
  }

  const results = new Map<string, DuplicateDetectionResult>()
  for (const item of places) {
    const potentialDuplicates = (outgoing.get(item.id) ?? []).map(({ id, score }) => {
      const other = byId.get(id)
      if (!other) throw new Error(`missing ${id}`)
      return {
        place: other,
        confidence: score,
        factors: {
          nameScore: 1,
          locationScore: 1,
          kindMatch: true,
          cityMatch: true,
          countryMatch: true,
        },
        reasoning: [] as string[],
        flags: [] as DuplicateFlag[],
      }
    })
    results.set(item.id, {
      originalPlace: item,
      potentialDuplicates,
      hasHighConfidenceDuplicates: potentialDuplicates.some((dup) => dup.confidence > 0.8),
      totalCandidates: places.length,
    })
  }
  return results
}
