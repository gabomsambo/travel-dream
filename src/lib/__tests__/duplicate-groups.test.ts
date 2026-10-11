import {
  batchDetectDuplicates,
  calculateNameSimilarity,
  findDuplicateClusters,
  scoreDuplicatePair,
  type DuplicateCluster,
  type DuplicateGroupEdge,
} from '../duplicate-detection'
import type { Place } from '@/types/database'
import { createMockPlace } from '@/__tests__/helpers/mass-upload-helpers'

/**
 * Cluster payload: stable id, weakest inclusion edge, and every pair in the
 * group. Scores stay on today's scorer, so Fjellheisen is 0.777 / 0.857 / 0.585.
 */
const EDGE_KEYS = [
  'a',
  'b',
  'score',
  'included',
  'distanceM',
  'factors',
  'for',
  'against',
  'flags',
] as const

const FACTOR_KEYS = ['name', 'location', 'kind', 'city', 'country'] as const

function place(partial: Partial<Place>): Place {
  return createMockPlace(partial)
}

function offset(lat: number, lon: number, northM: number): { lat: number; lon: number } {
  return { lat: lat + northM / 111320, lon }
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const perm of permutations(rest)) out.push([items[i], ...perm])
  }
  return out
}

async function groupAt(places: Place[], minConfidence = 0.7): Promise<DuplicateCluster[]> {
  const results = await batchDetectDuplicates(places)
  return findDuplicateClusters(results, 2, minConfidence)
}

function edge(cluster: DuplicateCluster, a: string, b: string): DuplicateGroupEdge {
  const [left, right] = a < b ? [a, b] : [b, a]
  const found = cluster.edges.find(item => item.a === left && item.b === right)
  if (!found) throw new Error(`missing edge ${left} ${right}`)
  return found
}

const origin = { lat: -25.6953, lon: -54.4367 }

function iguazuPlaces(): Place[] {
  return [
    place({
      id: 'A',
      name: 'Iguazu Falls',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      coords: origin,
    }),
    place({
      id: 'B',
      name: 'Iguazu Falls Brasil',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      coords: offset(origin.lat, origin.lon, 200),
    }),
    place({
      id: 'C',
      name: 'Falls Brasil',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      coords: offset(origin.lat, origin.lon, 421),
    }),
  ]
}

function fjellheisenPlaces(): Place[] {
  return [
    place({
      id: 'plc_fjell_rich',
      name: 'Fjellheisen Cable Car',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      status: 'library',
      coords: { lat: 69.6327, lon: 18.9853 },
    }),
    place({
      id: 'plc_fjell_inbox',
      name: 'Fjellheisen',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      status: 'inbox',
      coords: { lat: 69.6331, lon: 18.9861 },
    }),
    place({
      id: 'plc_fjell_sparse',
      name: 'Fjellheisen cable car',
      kind: 'attraction',
      city: null,
      country: 'Norway',
      status: 'inbox',
      coords: null,
    }),
  ]
}

describe('duplicate groups', () => {
  it('keeps one-letter name variants at a perfect name score', () => {
    expect(calculateNameSimilarity('Lisbon', 'Lisboa')).toBe(1)
    expect(calculateNameSimilarity('Iguazu Falls', 'Iguaçu Falls')).toBe(1)
  })

  describe('A/B/C insertion order', () => {
    // A–B is 0.800 at 200 m, B–C is about 0.788 at 221 m, A–C is 0.548 at 421 m.
    // The old walk kept A+B, B+A+C, or C+B depending on which row came first.
    it('returns the same group key in every order', async () => {
      const keys = new Set<string>()
      for (const order of permutations(iguazuPlaces())) {
        const clusters = await groupAt(order)
        expect(clusters).toHaveLength(1)
        keys.add(clusters[0].id)
        expect(clusters[0].places.map(item => item.id)).toEqual(['A', 'B', 'C'])
      }
      expect([...keys]).toEqual(['A+B+C'])
    })

    it('keeps the under-threshold pair on the group', async () => {
      const [cluster] = await groupAt(iguazuPlaces())
      const direct = edge(cluster, 'A', 'B')
      const bridge = edge(cluster, 'B', 'C')
      const weak = edge(cluster, 'A', 'C')

      expect(direct.score).toBeCloseTo(0.8, 3)
      expect(direct.included).toBe(true)
      expect(direct.distanceM).toBe(200)
      expect(bridge.included).toBe(true)
      expect(bridge.score).toBeGreaterThanOrEqual(0.7)
      expect(weak.included).toBe(false)
      expect(weak.score).toBeLessThan(0.6)
      expect(weak.score).toBeCloseTo(0.548, 2)
      expect(cluster.weakestIncludedScore).toBe(Math.min(direct.score, bridge.score))
      expect(cluster.cluster_id).toBe(cluster.id)
      expect(cluster.leftOut).toEqual([])
      expect(cluster.mergedOn).toBeNull()
    })
  })

  describe('Fjellheisen insertion order', () => {
    const key = 'plc_fjell_inbox+plc_fjell_rich+plc_fjell_sparse'

    it('returns the same group key in every order', async () => {
      const keys = new Set<string>()
      for (const order of permutations(fjellheisenPlaces())) {
        const clusters = await groupAt(order)
        expect(clusters).toHaveLength(1)
        keys.add(clusters[0].id)
        expect(clusters[0].cluster_id).toBe(key)
      }
      expect([...keys]).toEqual([key])
    })

    it('matches the clusters payload shape', async () => {
      const [cluster] = await groupAt(fjellheisenPlaces())

      expect(Object.keys(cluster).sort()).toEqual([
        'avgConfidence',
        'cluster_id',
        'edges',
        'id',
        'leftOut',
        'mergedOn',
        'places',
        'weakestIncludedScore',
      ])
      expect(cluster.id).toBe(key)
      expect(cluster.edges).toHaveLength(3)
      expect(cluster.weakestIncludedScore).toBeCloseTo(0.777, 3)

      const richInbox = edge(cluster, 'plc_fjell_rich', 'plc_fjell_inbox')
      const richSparse = edge(cluster, 'plc_fjell_rich', 'plc_fjell_sparse')
      const inboxSparse = edge(cluster, 'plc_fjell_inbox', 'plc_fjell_sparse')

      for (const item of cluster.edges) {
        expect(Object.keys(item).sort()).toEqual([...EDGE_KEYS].sort())
        expect(Object.keys(item.factors).sort()).toEqual([...FACTOR_KEYS].sort())
        expect(item.a < item.b).toBe(true)
        expect(Array.isArray(item.for)).toBe(true)
        expect(Array.isArray(item.against)).toBe(true)
        expect(Array.isArray(item.flags)).toBe(true)
        for (const factor of FACTOR_KEYS) {
          expect(typeof item.factors[factor]).toBe('number')
        }
      }

      expect(richInbox.included).toBe(true)
      expect(richInbox.score).toBeCloseTo(0.777, 3)
      expect(richInbox.distanceM).toBe(54)
      expect(richInbox.factors.kind).toBe(1)
      expect(richInbox.factors.city).toBe(1)
      expect(richInbox.factors.country).toBe(1)
      expect(richInbox.for).toEqual(expect.arrayContaining([
        'Names have some similarity',
        'Locations are very close',
        'Both are attraction type',
        'Both located in Tromsø',
        'Both in Norway',
      ]))
      expect(richInbox.against).toEqual([])
      expect(richInbox.flags).toEqual([])

      expect(richSparse.included).toBe(true)
      expect(richSparse.score).toBeCloseTo(0.857, 3)
      expect(richSparse.distanceM).toBeNull()
      expect(richSparse.factors).toEqual(expect.objectContaining({
        name: 1,
        location: 0,
        kind: 1,
        city: 0,
        country: 1,
      }))

      // Under the detector floor, so it used to be thrown away.
      expect(inboxSparse.included).toBe(false)
      expect(inboxSparse.score).toBeCloseTo(0.585, 3)
      expect(inboxSparse.distanceM).toBeNull()
      expect(inboxSparse.against).toEqual([])
      expect(inboxSparse.for).toEqual(expect.arrayContaining([
        'Names have some similarity',
        'Both are attraction type',
        'Both in Norway',
      ]))

      const includedScores = cluster.edges.filter(item => item.included).map(item => item.score)
      expect(cluster.weakestIncludedScore).toBe(Math.min(...includedScores))
      expect(cluster.avgConfidence).toBeCloseTo(
        includedScores.reduce((sum, score) => sum + score, 0) / includedScores.length,
        5
      )
    })
  })

  describe('against sentences and flags', () => {
    it('names a city and country disagreement without treating a blank city as one', async () => {
      const vienna = place({
        id: 'vie',
        name: 'Café Central',
        kind: 'cafe',
        city: 'Vienna',
        country: 'Austria',
        coords: null,
      })
      const madrid = place({
        id: 'mad',
        name: 'Café Central',
        kind: 'cafe',
        city: 'Madrid',
        country: 'Spain',
        coords: null,
      })
      const [cluster] = await groupAt([vienna, madrid])
      const pair = edge(cluster, 'vie', 'mad')
      expect(pair.included).toBe(true)
      expect(pair.score).toBeCloseTo(0.786, 2)
      expect(pair.distanceM).toBeNull()
      // The two sides are the member ids in order, so the sentence is stable.
      expect(pair.against).toEqual(['Madrid vs Vienna', 'Spain vs Austria'])
      expect(pair.flags).toEqual([])
    })

    it('does not call Lisbon and Lisboa different cities', async () => {
      const lisbon = place({
        id: 'lisbon',
        name: 'Miradouro',
        kind: 'landmark',
        city: 'Lisbon',
        country: 'Portugal',
        coords: null,
      })
      const lisboa = place({
        id: 'lisboa',
        name: 'Miradouro',
        kind: 'landmark',
        city: 'Lisboa',
        country: 'Portugal',
        coords: null,
      })
      const [cluster] = await groupAt([lisbon, lisboa])
      const pair = edge(cluster, 'lisbon', 'lisboa')
      expect(pair.against).not.toContain('Lisbon vs Lisboa')
      expect(pair.against.some(sentence => sentence.includes('Lisboa'))).toBe(false)
    })

    it('states a kind mismatch', async () => {
      const restaurant = place({
        id: 'dutch-a',
        name: 'My Old Dutch Pancake House',
        kind: 'restaurant',
        city: 'London',
        country: 'United Kingdom',
        coords: null,
      })
      const cafe = place({
        id: 'dutch-b',
        name: 'Old Dutch Pancake House',
        kind: 'cafe',
        city: 'London',
        country: 'United Kingdom',
        coords: null,
      })
      const [cluster] = await groupAt([restaurant, cafe])
      expect(edge(cluster, 'dutch-a', 'dutch-b').against).toContain('restaurant vs cafe')
    })

    it('states kilometres and the far-apart flag without lowering the score', async () => {
      const here = { lat: 38.7223, lon: -9.1393 }
      const left = place({
        id: 'star-a',
        name: 'Starbucks',
        kind: 'cafe',
        city: 'Lisbon',
        country: 'Portugal',
        coords: here,
      })
      const right = place({
        id: 'star-b',
        name: 'Starbucks',
        kind: 'cafe',
        city: 'Lisbon',
        country: 'Portugal',
        coords: offset(here.lat, here.lon, 3000),
      })
      const [cluster] = await groupAt([left, right])
      const pair = edge(cluster, 'star-a', 'star-b')
      expect(pair.included).toBe(true)
      expect(pair.score).toBeCloseTo(0.7, 2)
      expect(pair.distanceM).toBeGreaterThan(2000)
      expect(pair.against).toContain(`${((pair.distanceM ?? 0) / 1000).toFixed(1)} km apart`)
      expect(pair.flags).toContain('far apart')
    })

    it('states metres between 500 m and 2 km without the far-apart flag', async () => {
      const here = { lat: 38.7223, lon: -9.1393 }
      const left = place({
        id: 'near-a',
        name: 'Starbucks',
        kind: 'cafe',
        city: 'Lisbon',
        country: 'Portugal',
        coords: here,
      })
      const right = place({
        id: 'near-b',
        name: 'Starbucks',
        kind: 'cafe',
        city: 'Lisbon',
        country: 'Portugal',
        coords: offset(here.lat, here.lon, 1199),
      })
      const [cluster] = await groupAt([left, right])
      const pair = edge(cluster, 'near-a', 'near-b')
      expect(pair.score).toBeCloseTo(0.7, 2)
      expect(pair.distanceM).toBeGreaterThan(500)
      expect(pair.distanceM).toBeLessThanOrEqual(2000)
      expect(pair.against).toContain(`${pair.distanceM} m apart`)
      expect(pair.flags).not.toContain('far apart')
    })

    it('flags the same spot with different names and does not raise the score', async () => {
      const pin = { lat: 48.8584, lon: 2.2945 }
      const tower = place({
        id: 'spot-a',
        name: 'Alpha',
        kind: 'landmark',
        city: 'Paris',
        country: 'France',
        coords: pin,
      })
      const other = place({
        id: 'spot-b',
        name: 'Zebra',
        kind: 'landmark',
        city: 'Paris',
        country: 'France',
        coords: pin,
      })
      const natural = scoreDuplicatePair(tower, other)
      expect(natural.score).toBeCloseTo(0.68, 2)
      expect(await groupAt([tower, other])).toHaveLength(0)

      const [cluster] = await groupAt([tower, other], 0.6)
      const pair = edge(cluster, 'spot-a', 'spot-b')
      expect(pair.score).toBeCloseTo(natural.score, 5)
      expect(pair.score).toBeLessThan(0.7)
      expect(pair.flags).toContain('same spot, different name')
      expect(pair.against).toContain('Names differ')
      expect(pair.distanceM).toBe(0)
    })

    it('does not pull a low-scoring pair into a group just because the Google place id matches', async () => {
      const foo = place({
        id: 'g-a',
        name: 'Foo Place',
        kind: 'museum',
        city: 'Vienna',
        country: 'Austria',
        googlePlaceId: 'ChIJsame',
        coords: null,
      })
      const bar = place({
        id: 'g-b',
        name: 'Completely Different',
        kind: 'restaurant',
        city: 'Madrid',
        country: 'Spain',
        googlePlaceId: 'ChIJsame',
        coords: null,
      })
      const natural = scoreDuplicatePair(foo, bar)
      expect(natural.score).toBeLessThan(0.7)
      expect(natural.score).not.toBe(1)
      const clusters = await groupAt([foo, bar])
      expect(clusters).toHaveLength(0)
    })

    it('labels a same Google place id on a pair that already matches, without forcing the score to 1', async () => {
      const pin = { lat: 41.4036, lon: 2.1744 }
      const left = place({
        id: 'g-match-a',
        name: 'Sagrada Familia',
        kind: 'landmark',
        city: 'Barcelona',
        country: 'Spain',
        googlePlaceId: 'ChIJsagrada',
        coords: pin,
      })
      const right = place({
        id: 'g-match-b',
        name: 'Sagrada Familia',
        kind: 'landmark',
        city: 'Barcelona',
        country: 'Spain',
        googlePlaceId: 'ChIJsagrada',
        coords: offset(pin.lat, pin.lon, 100),
      })
      const natural = scoreDuplicatePair(left, right)
      const [cluster] = await groupAt([left, right])
      const pair = edge(cluster, 'g-match-a', 'g-match-b')
      expect(pair.flags).toContain('same Google place')
      expect(pair.score).toBeCloseTo(natural.score, 5)
      expect(pair.score).toBeLessThan(1)
    })

    it('still groups two blank cities and does not invent a city disagreement', async () => {
      const secret = place({
        id: 'beach-a',
        name: 'Secret Beach',
        kind: 'beach',
        city: null,
        country: null,
        coords: null,
      })
      const harris = place({
        id: 'beach-b',
        name: 'Harris Beach',
        kind: 'beach',
        city: null,
        country: null,
        coords: null,
      })
      const [cluster] = await groupAt([secret, harris])
      expect(cluster.places.map(item => item.id).sort()).toEqual(['beach-a', 'beach-b'])
      const pair = edge(cluster, 'beach-a', 'beach-b')
      expect(pair.included).toBe(true)
      expect(pair.score).toBeGreaterThanOrEqual(0.7)
      expect(pair.distanceM).toBeNull()
      expect(pair.against.some(sentence => sentence.includes(' vs '))).toBe(false)
    })
  })
})
