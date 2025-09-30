import { POST, GET } from '../route'
import { NextRequest } from 'next/server'

// Mock the database functions
jest.mock('@/lib/db-mutations', () => ({
  bulkConfirmPlaces: jest.fn(),
  batchArchivePlaces: jest.fn(),
}))

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn((fn) => fn()),
}))

import { bulkConfirmPlaces, batchArchivePlaces } from '@/lib/db-mutations'

const mockBulkConfirmPlaces = bulkConfirmPlaces as jest.MockedFunction<typeof bulkConfirmPlaces>
const mockBatchArchivePlaces = batchArchivePlaces as jest.MockedFunction<typeof batchArchivePlaces>

describe('/api/places/bulk-actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/places/bulk-actions', () => {
    it('confirms places successfully', async () => {
      mockBulkConfirmPlaces.mockResolvedValue(2)

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['place-1', 'place-2']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.result.updatedCount).toBe(2)
      expect(data.result.action).toBe('confirm')
      expect(mockBulkConfirmPlaces).toHaveBeenCalledWith(['place-1', 'place-2'])
    })

    it('archives places successfully', async () => {
      mockBatchArchivePlaces.mockResolvedValue(3)

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'archive',
          placeIds: ['place-1', 'place-2', 'place-3']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.result.updatedCount).toBe(3)
      expect(data.result.action).toBe('archive')
      expect(mockBatchArchivePlaces).toHaveBeenCalledWith(['place-1', 'place-2', 'place-3'])
    })

    it('handles partial success', async () => {
      mockBulkConfirmPlaces.mockResolvedValue(1)

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['place-1', 'place-2'] // Requesting 2 but only 1 updated
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('partial_success')
      expect(data.result.updatedCount).toBe(1)
      expect(data.result.requestedCount).toBe(2)
    })

    it('handles complete failure', async () => {
      mockBulkConfirmPlaces.mockResolvedValue(0)

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['place-1', 'place-2']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.status).toBe('error')
      expect(data.result.updatedCount).toBe(0)
    })

    it('validates request data', async () => {
      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'invalid-action',
          placeIds: ['place-1']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
      expect(data.message).toBe('Invalid request data')
    })

    it('requires at least one place ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: []
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
    })

    it('limits maximum places to 100', async () => {
      const largePlaceIds = Array.from({ length: 101 }, (_, i) => `place-${i}`)

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: largePlaceIds
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
    })

    it('removes duplicate place IDs', async () => {
      mockBulkConfirmPlaces.mockResolvedValue(2)

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['place-1', 'place-2', 'place-1', 'place-2'] // Duplicates
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.result.requestedCount).toBe(2) // Should be deduplicated
      expect(mockBulkConfirmPlaces).toHaveBeenCalledWith(['place-1', 'place-2'])
    })

    it('handles database errors gracefully', async () => {
      mockBulkConfirmPlaces.mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['place-1']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.status).toBe('error')
      expect(data.result.errors).toContain('Database connection failed')
    })

    it('handles invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
      expect(data.message).toBe('Invalid JSON in request body')
    })

    it('validates place ID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['', '   ', 'valid-id'] // Empty and whitespace IDs
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
    })
  })

  describe('GET /api/places/bulk-actions', () => {
    it('returns API documentation', async () => {
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('info')
      expect(data.documentation).toBeDefined()
      expect(data.documentation.endpoint).toBe('/api/places/bulk-actions')
      expect(data.documentation.method).toBe('POST')
      expect(data.documentation.actions).toHaveProperty('confirm')
      expect(data.documentation.actions).toHaveProperty('archive')
    })

    it('includes usage examples', async () => {
      const response = await GET()
      const data = await response.json()

      expect(data.documentation.examples).toBeDefined()
      expect(data.documentation.examples.confirm).toHaveProperty('action', 'confirm')
      expect(data.documentation.examples.archive).toHaveProperty('action', 'archive')
    })
  })
})

describe('Bulk Actions Error Scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('handles timeout scenarios', async () => {
    mockBulkConfirmPlaces.mockImplementation(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), 100)
      )
    )

    const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        placeIds: ['place-1']
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.status).toBe('error')
  })

  it('handles concurrent request scenarios', async () => {
    mockBulkConfirmPlaces.mockResolvedValue(1)

    const request1 = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        placeIds: ['place-1']
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const request2 = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'archive',
        placeIds: ['place-1']
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Both requests should be handled independently
    const [response1, response2] = await Promise.all([
      POST(request1),
      POST(request2)
    ])

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(500) // Second might fail if place already confirmed
  })

  it('validates action type strictly', async () => {
    const invalidActions = ['delete', 'update', 'move', '']

    for (const action of invalidActions) {
      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action,
          placeIds: ['place-1']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    }
  })
})