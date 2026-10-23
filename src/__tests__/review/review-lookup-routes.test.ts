/** @jest-environment node */
import { ALICE, FIXTURE, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture'

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: (error: unknown) => error instanceof Error && error.message === 'Unauthorized',
}))

import { requireAuthForApi } from '@/lib/auth-helpers'

type Exec = (query: { sql: string; args?: unknown[] }) => Promise<unknown>

function execute(sql: string, args: unknown[] = []) {
  const { client } = require('@/db') as { client: { execute: Exec } }
  return client.execute({ sql, args })
}

function request(url: string) {
  return new Request(url)
}

describe('review place lookups on a real SQLite file', () => {
  beforeEach(async () => {
    assertLocalDatabase()
    delete process.env.REVIEW_PLACES_STUB
    process.env.GOOGLE_PLACES_API_KEY = 'test-api-key'
    ;(global.fetch as jest.Mock).mockReset()
    await resetTenantFixture()
    ;(requireAuthForApi as jest.Mock).mockResolvedValue(ALICE)
  })

  it('suggests nothing and does not call Google when the place has no pin', async () => {
    const { GET } = require('@/app/api/review/places/[placeId]/city-suggestion/route') as {
      GET: (request: Request, ctx: { params: Promise<{ placeId: string }> }) => Promise<Response>
    }
    const response = await GET(request('http://localhost/api/review/places/x/city-suggestion'), {
      params: Promise.resolve({ placeId: FIXTURE.alicePlace }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ suggestion: null, unavailable: false })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refuses another tenant before any lookup', async () => {
    const { GET } = require('@/app/api/review/places/[placeId]/branches/route') as {
      GET: (request: Request, ctx: { params: Promise<{ placeId: string }> }) => Promise<Response>
    }
    const response = await GET(request('http://localhost/api/review/places/x/branches?q=cafe'), {
      params: Promise.resolve({ placeId: FIXTURE.bobPlace }),
    })
    expect([403, 404]).toContain(response.status)
    const body = await response.json()
    expect(JSON.stringify(body).toLowerCase()).not.toContain('bob')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns the stubbed town and branches for the owner, still with no Google call', async () => {
    process.env.REVIEW_PLACES_STUB = '1'
    await execute(
      `UPDATE places SET coords = ?, city = NULL, admin = ?, country = ? WHERE id = ?`,
      [JSON.stringify({ lat: 47.86, lon: -123.93 }), 'Washington', 'United States', FIXTURE.alicePlace],
    )
    const cityRoute = require('@/app/api/review/places/[placeId]/city-suggestion/route') as {
      GET: (request: Request, ctx: { params: Promise<{ placeId: string }> }) => Promise<Response>
    }
    const branchRoute = require('@/app/api/review/places/[placeId]/branches/route') as {
      GET: (request: Request, ctx: { params: Promise<{ placeId: string }> }) => Promise<Response>
    }
    const pinRoute = require('@/app/api/review/places/[placeId]/pin/route') as {
      GET: (request: Request, ctx: { params: Promise<{ placeId: string }> }) => Promise<Response>
    }
    const city = await cityRoute.GET(request('http://localhost/api/review/places/x/city-suggestion'), {
      params: Promise.resolve({ placeId: FIXTURE.alicePlace }),
    })
    expect(city.status).toBe(200)
    await expect(city.json()).resolves.toMatchObject({
      unavailable: false,
      suggestion: { locality: 'Forks', admin: 'Washington', areaLabel: 'Olympic National Park' },
    })
    const branches = await branchRoute.GET(request("http://localhost/api/review/places/x/branches?q=Gail's"), {
      params: Promise.resolve({ placeId: FIXTURE.alicePlace }),
    })
    const branchBody = await branches.json() as { candidates: Array<{ googlePlaceId: string }> }
    expect(branchBody.candidates).toHaveLength(3)
    const pin = await pinRoute.GET(
      request('http://localhost/api/review/places/x/pin?googlePlaceId=stub-gails-dulwich'),
      { params: Promise.resolve({ placeId: FIXTURE.alicePlace }) },
    )
    const pinBody = await pin.json() as { pin: { coords: { lat: number; lon: number } } }
    expect(pinBody.pin.coords).toEqual({ lat: 51.4496, lon: -0.0763 })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
