/**
 * @jest-environment node
 *
 * The activity bell discovers work via GET /api/upload/sessions. Lists and
 * per-session operations must enforce ownership, including associated-source
 * detail reads and cleanup driven by session metadata.
 */

jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn(), delete: jest.fn() },
}))

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}))

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}))

jest.mock('@vercel/blob', () => ({ del: jest.fn() }))

import { DELETE, GET, PATCH } from '@/app/api/upload/sessions/route'
import { db } from '@/db'
import { requireAuthForApi } from '@/lib/auth-helpers'
import { del } from '@vercel/blob'
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers'
import { mockSelect, whereMentions } from '../helpers/authz-helpers'

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock; delete: jest.Mock }
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>
const mockDel = del as jest.MockedFunction<typeof del>

const CALLER = createMockUser({ id: 'user_caller' })

function listRequest(query = 'limit=5') {
  return new Request(`http://localhost/api/upload/sessions?${query}`) as never
}

function getRequest(sessionId: string, details = false) {
  return new Request(`http://localhost/api/upload/sessions?sessionId=${sessionId}${details ? '&details=true' : ''}`) as never
}

function patchRequest(sessionId: string, body: Record<string, unknown> = { status: 'completed' }) {
  return new Request(`http://localhost/api/upload/sessions?sessionId=${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}

function deleteRequest(sessionId: string) {
  return new Request(`http://localhost/api/upload/sessions?sessionId=${sessionId}&cleanup=true`, {
    method: 'DELETE',
  }) as never
}

function mockUpdateReturning(result: unknown) {
  const returning = jest.fn().mockResolvedValue([result])
  const where = jest.fn().mockReturnValue({ returning })
  const set = jest.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set }
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

  it('filters active sessions with uploads before applying the limit', async () => {
    const olderEligibleSession = createMockSession({ id: 'session_older', userId: CALLER.id })
    const listed = mockSelect([olderEligibleSession])
    mockDb.select.mockReturnValueOnce(listed.chain)

    const res = await GET(listRequest('status=active&hasUploads=true&limit=5'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sessions: [{ id: 'session_older' }] })
    expect(whereMentions(listed.conditions[0], CALLER.id)).toBe(true)
    expect(whereMentions(listed.conditions[0], 'active')).toBe(true)
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

  it('does not let PATCH replace server-owned uploaded file ids', async () => {
    const session = createMockSession({ userId: CALLER.id, meta: { uploadedFiles: ['source_owned'] } })
    const listed = mockSelect(session)
    mockDb.select.mockReturnValueOnce(listed.chain)
    const updated = mockUpdateReturning(session)

    const res = await PATCH(patchRequest(session.id as string, {
      metadata: { uploadedFiles: ['source_victim'], startedAt: 'now' },
    }))

    expect(res.status).toBe(200)
    expect(updated.set).toHaveBeenCalledWith(expect.objectContaining({
      meta: { uploadedFiles: ['source_owned'], startedAt: 'now' },
    }))
  })

  it('does not return a source owned by another tenant in session details', async () => {
    const session = createMockSession({ userId: CALLER.id, meta: { uploadedFiles: ['source_victim'] } })
    const selectedSession = mockSelect(session)
    const selectedSource = mockSelect(null)
    mockDb.select
      .mockReturnValueOnce(selectedSession.chain)
      .mockReturnValueOnce(selectedSource.chain)

    const res = await GET(getRequest(session.id as string, true))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.session.sources).toEqual([])
    expect(whereMentions(selectedSource.conditions[0], 'source_victim')).toBe(true)
    expect(whereMentions(selectedSource.conditions[0], CALLER.id)).toBe(true)
  })

  it('does not delete another tenant source or blob during cleanup', async () => {
    const session = createMockSession({ userId: CALLER.id, meta: { uploadedFiles: ['source_victim'] } })
    const selectedSession = mockSelect(session)
    const selectedSource = mockSelect(null)
    mockDb.select
      .mockReturnValueOnce(selectedSession.chain)
      .mockReturnValueOnce(selectedSource.chain)
    const deleteWhere = jest.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where: deleteWhere })

    const res = await DELETE(deleteRequest(session.id as string))

    expect(res.status).toBe(200)
    expect(mockDel).not.toHaveBeenCalled()
    expect(mockDb.delete).toHaveBeenCalledTimes(1)
    expect(whereMentions(selectedSource.conditions[0], CALLER.id)).toBe(true)
  })
})
