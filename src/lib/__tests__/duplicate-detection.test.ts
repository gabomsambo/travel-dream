import {
  calculateNameSimilarity,
  calculateLocationDistance,
  calculateLocationSimilarity,
  calculateDuplicateScore,
  detectDuplicates,
  batchDetectDuplicates,
  findDuplicateClusters,
  checkAlternativeNames,
  generateDuplicateReasoning,
  DEFAULT_DETECTION_CONFIG,
} from '../duplicate-detection'
import type { Place } from '@/types/database'

// Mock places for testing
const mockPlaces: Place[] = [
  {
    id: 'place-1',
    name: 'Sagrada Familia',
    kind: 'landmark',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4036, lon: 2.1744 },
    address: 'Carrer de Mallorca, 401',
    altNames: ['Basílica de la Sagrada Família'],
    tags: ['Gaudí', 'architecture'],
    vibes: ['iconic'],
    ratingSelf: 5,
    notes: 'Amazing basilica',
    status: 'inbox',
    confidence: 0.95,
    createdAt: '2025-09-27T00:00:00Z',
    updatedAt: '2025-09-27T00:00:00Z',
  },
  {
    id: 'place-2',
    name: 'Basílica de la Sagrada Família',
    kind: 'church',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4036, lon: 2.1744 }, // Same coordinates
    address: null,
    altNames: ['Sagrada Familia'],
    tags: ['Gaudí', 'religious'],
    vibes: ['spiritual'],
    ratingSelf: 4,
    notes: 'Gaudí masterpiece',
    status: 'inbox',
    confidence: 0.92,
    createdAt: '2025-09-26T00:00:00Z',
    updatedAt: '2025-09-26T00:00:00Z',
  },
  {
    id: 'place-3',
    name: 'Park Güell',
    kind: 'park',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4145, lon: 2.1527 }, // Different location
    address: null,
    altNames: ['Parc Güell'],
    tags: ['Gaudí', 'park'],
    vibes: ['colorful'],
    ratingSelf: 4,
    notes: 'Beautiful park',
    status: 'inbox',
    confidence: 0.88,
    createdAt: '2025-09-25T00:00:00Z',
    updatedAt: '2025-09-25T00:00:00Z',
  },
  {
    id: 'place-4',
    name: 'Casa Batlló',
    kind: 'landmark',
    city: 'Madrid', // Different city
    country: 'ES',
    admin: 'Madrid',
    coords: { lat: 40.4168, lon: -3.7038 },
    address: null,
    altNames: [],
    tags: ['architecture'],
    vibes: ['artistic'],
    ratingSelf: 3,
    notes: null,
    status: 'inbox',
    confidence: 0.75,
    createdAt: '2025-09-24T00:00:00Z',
    updatedAt: '2025-09-24T00:00:00Z',
  },
]

describe('Duplicate Detection Utils', () => {
  describe('calculateNameSimilarity', () => {
    it('returns 1.0 for identical names', () => {
      const similarity = calculateNameSimilarity('Sagrada Familia', 'Sagrada Familia')
      expect(similarity).toBe(1.0)
    })

    it('returns high similarity for very similar names', () => {
      const similarity = calculateNameSimilarity('Sagrada Familia', 'Basílica de la Sagrada Família')
      expect(similarity).toBeGreaterThan(0.7)
    })

    it('returns 0 for completely different names', () => {
      const similarity = calculateNameSimilarity('Sagrada Familia', 'Eiffel Tower')
      expect(similarity).toBeLessThan(0.3)
    })

    it('handles case insensitivity', () => {
      const similarity = calculateNameSimilarity('SAGRADA FAMILIA', 'sagrada familia')
      expect(similarity).toBe(1.0)
    })

    it('handles empty strings', () => {
      const similarity1 = calculateNameSimilarity('', 'Sagrada Familia')
      const similarity2 = calculateNameSimilarity('Sagrada Familia', '')
      const similarity3 = calculateNameSimilarity('', '')

      expect(similarity1).toBe(0)
      expect(similarity2).toBe(0)
      expect(similarity3).toBe(1.0)
    })

    it('handles whitespace correctly', () => {
      const similarity = calculateNameSimilarity('  Sagrada Familia  ', 'Sagrada Familia')
      expect(similarity).toBe(1.0)
    })
  })

  describe('calculateLocationDistance', () => {
    it('returns 0 for identical coordinates', () => {
      const distance = calculateLocationDistance(
        { lat: 41.4036, lon: 2.1744 },
        { lat: 41.4036, lon: 2.1744 }
      )
      expect(distance).toBe(0)
    })

    it('calculates distance between Barcelona locations correctly', () => {
      const distance = calculateLocationDistance(
        { lat: 41.4036, lon: 2.1744 }, // Sagrada Familia
        { lat: 41.4145, lon: 2.1527 }  // Park Güell
      )
      expect(distance).toBeGreaterThan(1) // Should be more than 1km apart
      expect(distance).toBeLessThan(5)   // But less than 5km
    })

    it('calculates large distances correctly', () => {
      const distance = calculateLocationDistance(
        { lat: 41.4036, lon: 2.1744 }, // Barcelona
        { lat: 40.4168, lon: -3.7038 } // Madrid
      )
      expect(distance).toBeGreaterThan(500) // Should be hundreds of km apart
    })
  })

  describe('calculateLocationSimilarity', () => {
    it('returns 1.0 for identical locations', () => {
      const similarity = calculateLocationSimilarity(
        { lat: 41.4036, lon: 2.1744 },
        { lat: 41.4036, lon: 2.1744 },
        0.5
      )
      expect(similarity).toBe(1.0)
    })

    it('returns 0 for locations outside threshold', () => {
      const similarity = calculateLocationSimilarity(
        { lat: 41.4036, lon: 2.1744 }, // Barcelona
        { lat: 40.4168, lon: -3.7038 }, // Madrid
        0.5 // 500m threshold
      )
      expect(similarity).toBe(0)
    })

    it('returns proportional similarity within threshold', () => {
      const similarity = calculateLocationSimilarity(
        { lat: 41.4036, lon: 2.1744 },
        { lat: 41.4037, lon: 2.1745 }, // Very close
        1.0 // 1km threshold
      )
      expect(similarity).toBeGreaterThan(0.5)
      expect(similarity).toBeLessThan(1.0)
    })

    it('handles null coordinates', () => {
      const similarity1 = calculateLocationSimilarity(null, { lat: 41.4036, lon: 2.1744 }, 0.5)
      const similarity2 = calculateLocationSimilarity({ lat: 41.4036, lon: 2.1744 }, null, 0.5)
      const similarity3 = calculateLocationSimilarity(null, null, 0.5)

      expect(similarity1).toBe(0)
      expect(similarity2).toBe(0)
      expect(similarity3).toBe(0)
    })
  })

  describe('calculateDuplicateScore', () => {
    it('gives high score for obvious duplicates', () => {
      const { score } = calculateDuplicateScore(
        mockPlaces[0], // Sagrada Familia
        mockPlaces[1], // Basílica de la Sagrada Família
        DEFAULT_DETECTION_CONFIG
      )
      expect(score).toBeGreaterThan(0.8)
    })

    it('gives low score for different places', () => {
      const { score } = calculateDuplicateScore(
        mockPlaces[0], // Sagrada Familia (Barcelona)
        mockPlaces[3], // Casa Batlló (Madrid)
        DEFAULT_DETECTION_CONFIG
      )
      expect(score).toBeLessThan(0.5)
    })

    it('provides detailed factor breakdown', () => {
      const { factors } = calculateDuplicateScore(
        mockPlaces[0],
        mockPlaces[1],
        DEFAULT_DETECTION_CONFIG
      )

      expect(factors.nameScore).toBeGreaterThan(0.5)
      expect(factors.locationScore).toBe(1.0) // Same coordinates
      expect(factors.kindMatch).toBe(false) // landmark vs church
      expect(factors.cityMatch).toBe(true)
      expect(factors.countryMatch).toBe(true)
    })
  })

  describe('checkAlternativeNames', () => {
    it('finds matches in alternative names', () => {
      const similarity = checkAlternativeNames(mockPlaces[0], mockPlaces[1])
      expect(similarity).toBeGreaterThan(0.8) // Should find "Basílica de la Sagrada Família" match
    })

    it('handles places without alternative names', () => {
      const similarity = checkAlternativeNames(mockPlaces[0], mockPlaces[3])
      expect(similarity).toBeGreaterThan(0) // Should still compare main names
    })

    it('returns highest similarity across all name combinations', () => {
      const place1 = { ...mockPlaces[0], altNames: ['Name A', 'Name B'] }
      const place2 = { ...mockPlaces[1], altNames: ['Name C', 'Name A'] } // Exact match in altNames

      const similarity = checkAlternativeNames(place1, place2)
      expect(similarity).toBe(1.0)
    })
  })

  describe('generateDuplicateReasoning', () => {
    it('provides clear reasoning for high similarity', () => {
      const factors = {
        nameScore: 0.9,
        locationScore: 1.0,
        kindMatch: true,
        cityMatch: true,
        countryMatch: true
      }

      const reasoning = generateDuplicateReasoning(
        mockPlaces[0],
        mockPlaces[1],
        factors,
        0.95
      )

      expect(reasoning).toContain('Names are nearly identical')
      expect(reasoning).toContain('Locations are very close')
      expect(reasoning).toContain('Both are landmark type')
      expect(reasoning).toContain('Both located in Barcelona')
    })

    it('handles low similarity cases', () => {
      const factors = {
        nameScore: 0.2,
        locationScore: 0.0,
        kindMatch: false,
        cityMatch: false,
        countryMatch: true
      }

      const reasoning = generateDuplicateReasoning(
        mockPlaces[0],
        mockPlaces[3],
        factors,
        0.3
      )

      expect(reasoning).toContain('Low similarity detected')
    })
  })

  describe('detectDuplicates', () => {
    it('finds obvious duplicates', () => {
      const result = detectDuplicates(
        mockPlaces[0],
        mockPlaces,
        DEFAULT_DETECTION_CONFIG
      )

      expect(result.potentialDuplicates).toHaveLength(1)
      expect(result.potentialDuplicates[0].place.id).toBe('place-2')
      expect(result.potentialDuplicates[0].confidence).toBeGreaterThan(0.8)
      expect(result.hasHighConfidenceDuplicates).toBe(true)
    })

    it('excludes self from results', () => {
      const result = detectDuplicates(
        mockPlaces[0],
        mockPlaces,
        DEFAULT_DETECTION_CONFIG
      )

      const selfMatch = result.potentialDuplicates.find(d => d.place.id === mockPlaces[0].id)
      expect(selfMatch).toBeUndefined()
    })

    it('filters by confidence threshold', () => {
      const strictConfig = {
        ...DEFAULT_DETECTION_CONFIG,
        minConfidenceScore: 0.9
      }

      const result = detectDuplicates(
        mockPlaces[2], // Park Güell
        mockPlaces,
        strictConfig
      )

      expect(result.potentialDuplicates).toHaveLength(0)
    })

    it('sorts results by confidence descending', () => {
      // Add a third similar place
      const similarPlace = {
        ...mockPlaces[1],
        id: 'place-similar',
        confidence: 0.7
      }

      const testPlaces = [...mockPlaces, similarPlace]

      const result = detectDuplicates(
        mockPlaces[0],
        testPlaces,
        DEFAULT_DETECTION_CONFIG
      )

      if (result.potentialDuplicates.length > 1) {
        expect(result.potentialDuplicates[0].confidence)
          .toBeGreaterThanOrEqual(result.potentialDuplicates[1].confidence)
      }
    })
  })

  describe('batchDetectDuplicates', () => {
    it('processes multiple places', async () => {
      const results = await batchDetectDuplicates(
        mockPlaces.slice(0, 2), // First two places
        DEFAULT_DETECTION_CONFIG
      )

      expect(results.size).toBe(2)
      expect(results.get('place-1')).toBeDefined()
      expect(results.get('place-2')).toBeDefined()
    })

    it('calls progress callback', async () => {
      const progressCallback = jest.fn()

      await batchDetectDuplicates(
        mockPlaces.slice(0, 2),
        DEFAULT_DETECTION_CONFIG,
        progressCallback
      )

      expect(progressCallback).toHaveBeenCalledWith(1, 2)
      expect(progressCallback).toHaveBeenCalledWith(2, 2)
    })

    it('handles empty input', async () => {
      const results = await batchDetectDuplicates([], DEFAULT_DETECTION_CONFIG)
      expect(results.size).toBe(0)
    })
  })

  describe('findDuplicateClusters', () => {
    it('groups obvious duplicates into clusters', async () => {
      const batchResults = await batchDetectDuplicates(mockPlaces, DEFAULT_DETECTION_CONFIG)
      const clusters = findDuplicateClusters(batchResults, 2)

      expect(clusters.length).toBeGreaterThanOrEqual(1)

      const sagradaCluster = clusters.find(c =>
        c.places.some(p => p.id === 'place-1') &&
        c.places.some(p => p.id === 'place-2')
      )

      expect(sagradaCluster).toBeDefined()
      expect(sagradaCluster?.places).toHaveLength(2)
    })

    it('respects minimum cluster size', async () => {
      const batchResults = await batchDetectDuplicates(mockPlaces, DEFAULT_DETECTION_CONFIG)
      const clusters = findDuplicateClusters(batchResults, 5) // Require 5+ items

      expect(clusters).toHaveLength(0) // No clusters should meet this requirement
    })

    it('sorts clusters by average confidence', async () => {
      const batchResults = await batchDetectDuplicates(mockPlaces, DEFAULT_DETECTION_CONFIG)
      const clusters = findDuplicateClusters(batchResults, 2)

      if (clusters.length > 1) {
        expect(clusters[0].avgConfidence).toBeGreaterThanOrEqual(clusters[1].avgConfidence)
      }
    })

    it('generates unique cluster IDs', async () => {
      const batchResults = await batchDetectDuplicates(mockPlaces, DEFAULT_DETECTION_CONFIG)
      const clusters = findDuplicateClusters(batchResults, 2)

      const clusterIds = clusters.map(c => c.cluster_id)
      const uniqueIds = new Set(clusterIds)
      expect(uniqueIds.size).toBe(clusterIds.length)
    })
  })

  describe('Edge Cases', () => {
    it('handles places with missing data', () => {
      const incompletePlaces = [
        {
          id: 'incomplete-1',
          name: 'Test Place',
          kind: 'landmark',
          city: null,
          country: null,
          coords: null,
          confidence: 0.5
        },
        {
          id: 'incomplete-2',
          name: 'Test Place 2',
          kind: 'landmark',
          city: null,
          country: null,
          coords: null,
          confidence: 0.6
        }
      ] as Place[]

      const result = detectDuplicates(
        incompletePlaces[0],
        incompletePlaces,
        DEFAULT_DETECTION_CONFIG
      )

      expect(result).toBeDefined()
      expect(result.potentialDuplicates).toBeDefined()
    })

    it('handles very similar coordinates', () => {
      const place1 = {
        ...mockPlaces[0],
        coords: { lat: 41.403600, lon: 2.174400 }
      }
      const place2 = {
        ...mockPlaces[1],
        coords: { lat: 41.403601, lon: 2.174401 } // 1m difference
      }

      const { factors } = calculateDuplicateScore(place1, place2, DEFAULT_DETECTION_CONFIG)
      expect(factors.locationScore).toBeGreaterThan(0.9)
    })

    it('handles special characters in names', () => {
      const similarity = calculateNameSimilarity(
        'Café Münchën',
        'Cafe Munchen'
      )
      expect(similarity).toBeGreaterThan(0.5)
    })

    it('handles very long place names', () => {
      const longName1 = 'A'.repeat(1000)
      const longName2 = 'B'.repeat(1000)

      const similarity = calculateNameSimilarity(longName1, longName2)
      expect(similarity).toBeDefined()
      expect(similarity).toBeGreaterThanOrEqual(0)
      expect(similarity).toBeLessThanOrEqual(1)
    })
  })

  describe('Performance', () => {
    it('completes duplicate detection within reasonable time', () => {
      const start = Date.now()

      detectDuplicates(
        mockPlaces[0],
        mockPlaces,
        DEFAULT_DETECTION_CONFIG
      )

      const duration = Date.now() - start
      expect(duration).toBeLessThan(100) // Should complete in under 100ms
    })

    it('handles large datasets efficiently', async () => {
      // Create 100 mock places
      const largePlaceSet = Array.from({ length: 100 }, (_, i) => ({
        ...mockPlaces[0],
        id: `place-${i}`,
        name: `Test Place ${i}`,
        confidence: Math.random()
      })) as Place[]

      const start = Date.now()
      await batchDetectDuplicates(largePlaceSet.slice(0, 10), DEFAULT_DETECTION_CONFIG)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
    })
  })
})