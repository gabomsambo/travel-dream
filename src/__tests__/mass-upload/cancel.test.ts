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

jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST } from '@/app/api/mass-upload/cancel/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { del } from '@vercel/blob';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';
import { mockSelect, whereMentions } from '../helpers/authz-helpers';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock };

const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockDel = del as jest.MockedFunction<typeof del>;

// ── Helpers ────────────────────────────────────────────────────────────
function createCancelRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/mass-upload/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mass-upload/cancel', () => {
  const mockUser = createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(mockUser);
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const req = createCancelRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);

    expect(res.status).toBe(401);
  });

  it('rejects missing sessionId', async () => {
    const req = createCancelRequest({});
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

    const req = createCancelRequest({ sessionId: 'session_nonexistent' });
    const res = await POST(req as never);

    expect(res.status).toBe(404);
    expect(whereMentions(scoped.conditions[0], mockUser.id)).toBe(true);
  });

  it('returns 403 for wrong user', async () => {
    const scoped = mockSelect(null); // not the caller's session
    const probe = mockSelect({ id: 'session_test-1' }); // but it does exist
    mockDb.select.mockReturnValueOnce(scoped.chain).mockReturnValueOnce(probe.chain);

    const req = createCancelRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);

    expect(res.status).toBe(403);
    expect(whereMentions(scoped.conditions[0], mockUser.id)).toBe(true);
  });

  it('cancels queued/uploaded sources and reports alreadyProcessing count', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_test-1', 'src_test-2', 'src_test-3'],
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

    // Cancel queued/uploaded sources → returning cancelled ones
    const cancelChain = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            { id: 'src_test-1' },
            { id: 'src_test-2' },
          ]),
        }),
      }),
    };
    mockDb.update.mockReturnValueOnce(cancelChain);

    // Mark session as cancelled
    const sessionUpdateChain = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    };
    mockDb.update.mockReturnValueOnce(sessionUpdateChain);

    // Count in-flight sources
    const inFlightChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ count: 1 }]),
      }),
    };
    mockDb.select.mockReturnValueOnce(inFlightChain);

    const req = createCancelRequest({ sessionId: 'session_test-1' });
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.cancelled).toBe(2);
    expect(data.alreadyProcessing).toBe(1);
  });

  it('does not cancel or delete a planted source owned by another tenant', async () => {
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
    mockDb.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    });
    const inFlightWhere = jest.fn().mockResolvedValue([{ count: 0 }]);
    mockDb.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({ where: inFlightWhere }),
    });

    const res = await POST(createCancelRequest({ sessionId: session.id }) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cancelled).toBe(0);
    expect(data.alreadyProcessing).toBe(0);
    expect(mockDel).not.toHaveBeenCalled();
    expect(whereMentions(sourceWhere.mock.calls[0][0], mockUser.id)).toBe(true);
    expect(whereMentions(inFlightWhere.mock.calls[0][0], mockUser.id)).toBe(true);
  });
});
