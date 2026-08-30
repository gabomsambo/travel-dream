/**
 * @jest-environment node
 *
 * The activity bell discovers work via GET /api/upload/sessions. That list
 * must be scoped to the caller, and per-id GET/PATCH must 404 then 403.
 */

jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
}))

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}))

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}))

jest.mock('@vercel/blob', () => ({ del: jest.fn() }))

import { GET, PATCH } from '@/app/api/upload/sessions/route'
import { db } from '@/db'
import { requireAuthForApi } from '@/lib/auth-helpers'
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers'
import { mockSelect, whereMentions } from '../helpers/authz-helpers'

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock }
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>

const CALLER = createMockUser({ id: 'user_caller' })

function listRequest() {
  return new Request('http://localhost/api/upload/sessions?limit=5') as never
}

function getRequest(sessionId: string) {
  return new Request(`http://localhost/api/upload/sessions?sessionId=${sessionId}`) as never
}

function patchRequest(sessionId: string) {
  return new Request(`http://localhost/api/upload/sessions?sessionId=${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  }) as never
}

describe('GET/PATCH /api/upload/sessions ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue(CALLER)
  })

  it('scopes the session list to the caller', async () => {
    const listed = mockSelect([])
    mockDb.select.mockReturnValueOnce(listed.chain)

    const res = await GET(listRequest())
    expect(res.status).toBe(200)
    expect(listed.conditions.length).toBeGreaterThan(0)
    expect(whereMentions(listed.conditions[0], CALLER.id)).toBe(true)
  })

  it('returns 404 when a session id does not exist', async () => {
    const listed = mockSelect(null)
    mockDb.select.mockReturnValueOnce(listed.chain)

    const res = await GET(getRequest('session_missing'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when the session belongs to another user', async () => {
    const victim = createMockSession({ userId: 'user_victim' })
    const listed = mockSelect(victim)
    mockDb.select.mockReturnValueOnce(listed.chain)

    const res = await GET(getRequest(victim.id as string))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.message).toBe('Forbidden')
  })

  it('refuses PATCH of another user\'s session with 403', async () => {
    const victim = createMockSession({ userId: 'user_victim' })
    const listed = mockSelect(victim)
    mockDb.select.mockReturnValueOnce(listed.chain)

    const res = await PATCH(patchRequest(victim.id as string))
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('returns 404 on PATCH when the session is missing', async () => {
    const listed = mockSelect(null)
    mockDb.select.mockReturnValueOnce(listed.chain)

    const res = await PATCH(patchRequest('session_missing'))
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
