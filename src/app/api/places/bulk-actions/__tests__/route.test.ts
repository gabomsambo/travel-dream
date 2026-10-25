/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn().mockResolvedValue({ id: 'user_test', email: 'test@example.com', name: 'Test', image: null }),
  isAuthError: jest.fn().mockReturnValue(false),
}));

// Mock the database functions
jest.mock('@/lib/db-mutations', () => ({
  bulkConfirmPlaces: jest.fn(),
  bulkReturnPlacesToInbox: jest.fn(),
  batchArchivePlaces: jest.fn(),
  batchRestorePlaces: jest.fn(),
  batchDeletePlaces: jest.fn(),
  batchSetVisitStatus: jest.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST, GET } from '../route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn((fn) => fn()),
  NotFoundError: class NotFoundError extends Error {},
}))

jest.mock('@/lib/db-queries', () => ({
  getOwnedPlaceIds: jest.fn(async (ids: string[]) => new Set(ids)),
}))

import { bulkConfirmPlaces, bulkReturnPlacesToInbox, batchArchivePlaces } from '@/lib/db-mutations'
import { getOwnedPlaceIds } from '@/lib/db-queries'

const mockBulkConfirmPlaces = bulkConfirmPlaces as jest.MockedFunction<typeof bulkConfirmPlaces>
const mockBulkReturnPlacesToInbox = bulkReturnPlacesToInbox as jest.MockedFunction<typeof bulkReturnPlacesToInbox>
const mockBatchArchivePlaces = batchArchivePlaces as jest.MockedFunction<typeof batchArchivePlaces>
const mockGetOwnedPlaceIds = getOwnedPlaceIds as jest.MockedFunction<typeof getOwnedPlaceIds>

function placeIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `place-${i}`)
}

function bulkRequest(action: string, ids: string[], extra: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/places/bulk-actions', {
    method: 'POST',
    body: JSON.stringify({ action, placeIds: ids, ...extra }),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('/api/places/bulk-actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/places/bulk-actions', () => {
    it('confirms places successfully', async () => {
      mockBulkConfirmPlaces.mockResolvedValue({ updatedCount: 2, updatedIds: ['place-1', 'place-2'] })

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
      expect(mockBulkConfirmPlaces).toHaveBeenCalledWith(['place-1', 'place-2'], expect.any(String))
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
      expect(mockBatchArchivePlaces).toHaveBeenCalledWith(['place-1', 'place-2', 'place-3'], expect.any(String))
    })

    it('handles partial success', async () => {
      mockBulkConfirmPlaces.mockResolvedValue({ updatedCount: 1, updatedIds: ['place-1'] })

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
      expect(data.result.updatedIds).toEqual(['place-1'])
      expect(data.result.requestedCount).toBe(2)
    })

    it('handles complete failure', async () => {
      mockBulkConfirmPlaces.mockResolvedValue({ updatedCount: 0, updatedIds: [] })

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

    it('returns 404 when a place id is not the caller\'s', async () => {
      mockGetOwnedPlaceIds.mockResolvedValueOnce(new Set(['place-1']))

      const request = new NextRequest('http://localhost:3000/api/places/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          placeIds: ['place-1', 'place-foreign']
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.status).toBe('error')
      expect(mockBulkConfirmPlaces).not.toHaveBeenCalled()
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

    it.each([501, 5000])('confirms %i places in one request', async (count) => {
      const ids = placeIds(count)
      mockBulkConfirmPlaces.mockResolvedValue({ updatedCount: count, updatedIds: ids })

      const response = await POST(bulkRequest('confirm', ids))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.result.updatedCount).toBe(count)
      expect(mockGetOwnedPlaceIds).toHaveBeenCalledWith(ids, 'user_test')
      expect(mockBulkConfirmPlaces).toHaveBeenCalledTimes(1)
      expect(mockBulkConfirmPlaces).toHaveBeenCalledWith(ids, 'user_test')
    })

    it.each([501, 5000])('returns %i places to the inbox in one request', async (count) => {
      const ids = placeIds(count)
      mockBulkReturnPlacesToInbox.mockResolvedValue({ updatedCount: count, updatedIds: ids })

      const response = await POST(bulkRequest('return-to-inbox', ids))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('success')
      expect(data.result.updatedCount).toBe(count)
      expect(mockGetOwnedPlaceIds).toHaveBeenCalledWith(ids, 'user_test')
      expect(mockBulkReturnPlacesToInbox).toHaveBeenCalledTimes(1)
      expect(mockBulkReturnPlacesToInbox).toHaveBeenCalledWith(ids, 'user_test')
    })

    it('rejects confirm above 5000 places', async () => {
      const response = await POST(bulkRequest('confirm', placeIds(5001)))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.status).toBe('error')
      expect(mockBulkConfirmPlaces).not.toHaveBeenCalled()
    })

    it.each(['archive', 'restore', 'delete', 'set-visit-status'])(
      'rejects %s above 500 places',
      async (action) => {
        const extra: Record<string, string> =
          action === 'set-visit-status' ? { visitStatus: 'visited' } : {}
        const response = await POST(bulkRequest(action, placeIds(501), extra))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.status).toBe('error')
        expect(mockBulkConfirmPlaces).not.toHaveBeenCalled()
        expect(mockBulkReturnPlacesToInbox).not.toHaveBeenCalled()
        expect(mockBatchArchivePlaces).not.toHaveBeenCalled()
      }
    )

    it('removes duplicate place IDs', async () => {
      mockBulkConfirmPlaces.mockResolvedValue({ updatedCount: 2, updatedIds: ['place-1', 'place-2'] })

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
      expect(mockBulkConfirmPlaces).toHaveBeenCalledWith(['place-1', 'place-2'], expect.any(String))
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
    mockBulkConfirmPlaces.mockResolvedValue({ updatedCount: 1, updatedIds: ['place-1'] })
    mockBatchArchivePlaces.mockResolvedValue(1)

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
    expect(response2.status).toBe(200)
  })

  it('validates action type strictly', async () => {
    const invalidActions = ['update', 'move', '']

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