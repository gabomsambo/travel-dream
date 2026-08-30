/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST } from '@/app/api/mass-upload/start/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';
import { mockSelect, whereMentions } from '../helpers/authz-helpers';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock };

const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

// ── Helpers ────────────────────────────────────────────────────────────
function createStartRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/mass-upload/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mass-upload/start', () => {
  const mockUser = createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(mockUser);
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const req = createStartRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);

    expect(res.status).toBe(401);
  });

  it('rejects missing sessionId', async () => {
    const req = createStartRequest({});
    const res = await POST(req as never);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors).toBeDefined();
  });

  // The session lookup goes through `forUser(...).findOwned`: a scoped read
  // first, then — only if that misses — an id-only probe that separates "no
  // such session" from "someone else's session".
  it('returns 404 for unknown session', async () => {
    const scoped = mockSelect(null);
    const probe = mockSelect(null);
    mockDb.select.mockReturnValueOnce(scoped.chain).mockReturnValueOnce(probe.chain);

    const req = createStartRequest({ sessionId: 'session_nonexistent' });
    const res = await POST(req as never);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('Session not found');
    expect(whereMentions(scoped.conditions[0], mockUser.id)).toBe(true);
  });

  it('returns 403 for wrong user', async () => {
    const scoped = mockSelect(null); // not the caller's session
    const probe = mockSelect({ id: 'session_test-1' }); // but it does exist
    mockDb.select.mockReturnValueOnce(scoped.chain).mockReturnValueOnce(probe.chain);

    const req = createStartRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);

    expect(res.status).toBe(403);
    expect(whereMentions(scoped.conditions[0], mockUser.id)).toBe(true);
  });

  it('returns queued: 0 when session has no uploadedFiles', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: [],
        processingQueue: [],
        errors: [],
      },
    });

    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(session),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const req = createStartRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.queued).toBe(0);
    // Should NOT call db.update since there's nothing to transition
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('transitions uploaded sources to queued and returns count', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_test-1', 'src_test-2'],
        processingQueue: [],
        errors: [],
      },
    });

    // Session lookup
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(session),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    // Update sources: uploaded → queued
    const updateChain = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            { id: 'src_test-1' },
            { id: 'src_test-2' },
          ]),
        }),
      }),
    };
    mockDb.update.mockReturnValueOnce(updateChain);

    const req = createStartRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.queued).toBe(2);
  });

  it('does not queue a planted source owned by another tenant', async () => {
    const session = createMockSession({ meta: { uploadedFiles: ['src_victim'] } });
    mockDb.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(session) }),
      }),
    });
    const sourceWhere = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    });
    mockDb.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({ where: sourceWhere }),
    });

    const res = await POST(createStartRequest({ sessionId: session.id }) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.queued).toBe(0);
    expect(whereMentions(sourceWhere.mock.calls[0][0], mockUser.id)).toBe(true);
  });
});
