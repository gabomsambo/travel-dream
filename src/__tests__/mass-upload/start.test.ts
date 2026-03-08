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

  it('returns 404 for unknown session', async () => {
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(null),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const req = createStartRequest({ sessionId: 'session_nonexistent' });
    const res = await POST(req as never);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('Session not found');
  });

  it('returns 403 for wrong user', async () => {
    const session = createMockSession({ userId: 'other-user' });
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

    expect(res.status).toBe(403);
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
});
