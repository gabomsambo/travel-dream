import { GET, DELETE, OPTIONS } from '../route'
import { NextRequest } from 'next/server'

// Mock the database and duplicate detection functions
jest.mock('@/lib/db-utils')
jest.mock('@/lib/db-queries')
jest.mock('@/lib/duplicate-detection')
jest.mock('@/db')

import { withErrorHandling } from '@/lib/db-utils'
import { getPlacesByStatus } from '@/lib/db-queries'
import { detectDuplicates, batchDetectDuplicates, findDuplicateClusters } from '@/lib/duplicate-detection'
import { db } from '@/db'
import { places } from '@/db/schema'

const mockWithErrorHandling = withErrorHandling as jest.MockedFunction<typeof withErrorHandling>
const mockGetPlacesByStatus = getPlacesByStatus as jest.MockedFunction<typeof getPlacesByStatus>
const mockDetectDuplicates = detectDuplicates as jest.MockedFunction<typeof detectDuplicates>
const mockBatchDetectDuplicates = batchDetectDuplicates as jest.MockedFunction<typeof batchDetectDuplicates>
const mockFindDuplicateClusters = findDuplicateClusters as jest.MockedFunction<typeof findDuplicateClusters>

// Mock places data
const mockPlaces = [
  {
    id: 'place-1',
    name: 'Sagrada Familia',
    kind: 'landmark',
    city: 'Barcelona',
    country: 'ES',
    confidence: 0.95,
    coords: { lat: 41.4036, lon: 2.1744 }
  },
  {
    id: 'place-2',
    name: 'Basílica de la Sagrada Família',
    kind: 'church',
    city: 'Barcelona',
    country: 'ES',
    confidence: 0.92,
    coords: { lat: 41.4036, lon: 2.1744 }
  },
  {
    id: 'place-3',
    name: 'Park Güell',
    kind: 'park',
    city: 'Barcelona',
    country: 'ES',
    confidence: 0.88,
    coords: { lat: 41.4145, lon: 2.1527 }
  }
]

describe('/api/places/duplicates', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWithErrorHandling.mockImplementation((fn) => fn())
  })

  describe('GET /api/places/duplicates - Single Mode', () => {
    it('finds duplicates for a specific place', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockPlaces[0]])
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      const mockDuplicateResult = {
        originalPlace: mockPlaces[0],
        potentialDuplicates: [
          {
            place: mockPlaces[1],
            confidence: 0.89,
            factors: {
              nameScore: 0.85,
              locationScore: 1.0,
              kindMatch: false,
              cityMatch: true,
              countryMatch: true
            },
            reasoning: ['Names are very similar', 'Same location', 'Both in Barcelona']
          }
        ],
        hasHighConfidenceDuplicates: true,
        totalCandidates: 2
      }

      mockDetectDuplicates.mockReturnValue(mockDuplicateResult)

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=place-1')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.mode).toBe('single')
      expect(data.result.potentialDuplicates).toHaveLength(1)
      expect(data.result.potentialDuplicates[0].confidence).toBe(0.89)
      expect(data.performance.candidatesChecked).toBe(2)
      expect(data.performance.duplicatesFound).toBe(1)
    })

    it('returns 404 for non-existent place', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=non-existent')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.status).toBe('error')
      expect(data.message).toBe('Place not found')
    })

    it('requires placeId for single mode', async () => {
      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
      expect(data.message).toBe('placeId is required for single mode')
    })
  })

  describe('GET /api/places/duplicates - Batch Mode', () => {
    it('finds duplicates for multiple places', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockPlaces)
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      const mockBatchResults = new Map([
        ['place-1', {
          originalPlace: mockPlaces[0],
          potentialDuplicates: [
            {
              place: mockPlaces[1],
              confidence: 0.89,
              factors: {
                nameScore: 0.85,
                locationScore: 1.0,
                kindMatch: false,
                cityMatch: true,
                countryMatch: true
              },
              reasoning: ['Very similar names', 'Same location']
            }
          ],
          hasHighConfidenceDuplicates: true,
          totalCandidates: 2
        }]
      ])

      mockBatchDetectDuplicates.mockResolvedValue(mockBatchResults)

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=batch&status=inbox')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.mode).toBe('batch')
      expect(data.results['place-1']).toBeDefined()
      expect(data.summary.totalPlaces).toBe(3)
      expect(data.summary.placesWithDuplicates).toBe(1)
      expect(data.summary.totalDuplicateMatches).toBe(1)
    })

    it('handles empty results gracefully', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=batch')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.mode).toBe('batch')
      expect(data.summary.totalPlaces).toBe(0)
    })
  })

  describe('GET /api/places/duplicates - Clusters Mode', () => {
    it('finds duplicate clusters', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockPlaces)
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      const mockBatchResults = new Map()
      mockBatchDetectDuplicates.mockResolvedValue(mockBatchResults)

      const mockClusters = [
        {
          places: [mockPlaces[0], mockPlaces[1]],
          avgConfidence: 0.89,
          cluster_id: 'cluster-1'
        }
      ]

      mockFindDuplicateClusters.mockReturnValue(mockClusters)

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=clusters&minConfidence=0.7')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.mode).toBe('clusters')
      expect(data.clusters).toHaveLength(1)
      expect(data.clusters[0].places).toHaveLength(2)
      expect(data.summary.totalClusters).toBe(1)
      expect(data.summary.largestClusterSize).toBe(2)
    })

    it('handles insufficient data for clustering', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockPlaces[0]]) // Only one place
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=clusters')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.mode).toBe('clusters')
      expect(data.clusters).toHaveLength(0)
      expect(data.summary.totalPlaces).toBe(1)
    })
  })

  describe('Query Parameter Validation', () => {
    it('validates confidence threshold', async () => {
      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=place-1&minConfidence=1.5')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
      expect(data.message).toBe('Invalid query parameters')
    })

    it('validates limit parameter', async () => {
      const url = new URL('http://localhost:3000/api/places/duplicates?mode=batch&limit=2000')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
    })

    it('validates status parameter', async () => {
      const url = new URL('http://localhost:3000/api/places/duplicates?mode=batch&status=invalid')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
    })

    it('validates mode parameter', async () => {
      const url = new URL('http://localhost:3000/api/places/duplicates?mode=invalid')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
    })
  })

  describe('Caching', () => {
    it('returns cached results when available', async () => {
      // First request
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockPlaces[0]])
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      mockDetectDuplicates.mockReturnValue({
        originalPlace: mockPlaces[0],
        potentialDuplicates: [],
        hasHighConfidenceDuplicates: false,
        totalCandidates: 2
      })

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=place-1')
      const request1 = new NextRequest(url)
      const request2 = new NextRequest(url)

      const response1 = await GET(request1)
      const data1 = await response1.json()

      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(data1.cached).toBe(false)
      expect(data2.cached).toBe(true)
    })
  })

  describe('Performance Monitoring', () => {
    it('includes performance metrics', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockPlaces[0]])
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      mockDetectDuplicates.mockReturnValue({
        originalPlace: mockPlaces[0],
        potentialDuplicates: [],
        hasHighConfidenceDuplicates: false,
        totalCandidates: 2
      })

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=place-1')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(data.performance).toBeDefined()
      expect(data.performance.candidatesChecked).toBe(2)
      expect(data.performance.duplicatesFound).toBe(0)
      expect(data.performance.highConfidenceMatches).toBe(0)
    })
  })

  describe('DELETE /api/places/duplicates', () => {
    it('clears cache successfully', async () => {
      const response = await DELETE()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.message).toBe('Duplicate detection cache cleared')
    })
  })

  describe('OPTIONS /api/places/duplicates', () => {
    it('returns API documentation', async () => {
      const response = await OPTIONS()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('info')
      expect(data.documentation).toBeDefined()
      expect(data.documentation.endpoint).toBe('/api/places/duplicates')
      expect(data.documentation.modes).toBeDefined()
      expect(data.documentation.modes.single).toBe('Find duplicates for a specific place')
      expect(data.documentation.modes.batch).toBe('Find duplicates for multiple places')
      expect(data.documentation.modes.clusters).toBe('Find groups of similar places')
    })
  })

  describe('Error Handling', () => {
    it('handles database errors gracefully', async () => {
      mockWithErrorHandling.mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=place-1')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.status).toBe('error')
      expect(data.message).toBe('Database connection failed')
    })

    it('handles duplicate detection algorithm errors', async () => {
      const mockDbSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockPlaces[0]])
      }
      ;(db as any).select = jest.fn().mockReturnValue(mockDbSelect)

      mockDetectDuplicates.mockImplementation(() => {
        throw new Error('Algorithm error')
      })

      const url = new URL('http://localhost:3000/api/places/duplicates?mode=single&placeId=place-1')
      const request = new NextRequest(url)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.status).toBe('error')
    })
  })
})