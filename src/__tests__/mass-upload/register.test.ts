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

jest.mock('@/lib/db-mutations', () => ({
  createSource: jest.fn(),
}));

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST } from '@/app/api/mass-upload/register/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { createSource } from '@/lib/db-mutations';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock };

const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockCreateSource = createSource as jest.MockedFunction<typeof createSource>;

// ── Helpers ────────────────────────────────────────────────────────────
function createRegisterRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/mass-upload/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  sessionId: 'session_test-1',
  blobUrl: 'https://blob.vercel-storage.com/test-image.jpg',
  originalName: 'photo.jpg',
  fileSize: 1024000,
  mimeType: 'image/jpeg',
};

describe('POST /api/mass-upload/register', () => {
  const mockUser = createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(mockUser);
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);

    expect(res.status).toBe(401);
  });

  it('rejects missing blobUrl', async () => {
    const body = { ...validBody, blobUrl: undefined };
    const req = createRegisterRequest(body);
    const res = await POST(req as never);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors).toBeDefined();
  });

  it('rejects invalid URL format', async () => {
    const body = { ...validBody, blobUrl: 'not-a-url' };
    const req = createRegisterRequest(body);
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('rejects missing sessionId', async () => {
    const body = { ...validBody, sessionId: undefined };
    const req = createRegisterRequest(body);
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown session', async () => {
    // Session query returns null (not found)
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(null),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('Session not found');
  });

  it('returns 403 when session belongs to different user', async () => {
    const session = createMockSession({ userId: 'other-user' });
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(session),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain('Forbidden');
  });

  it('creates source and returns success on happy path', async () => {
    const session = createMockSession();

    // Session lookup
    const selectChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(session),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    // createSource
    mockCreateSource.mockResolvedValue({ id: 'src_test-new' } as never);

    // Update processingStatus to 'uploaded'
    const updateChain = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    };
    mockDb.update.mockReturnValueOnce(updateChain);

    // withErrorHandling runs the fn, which does:
    // 1. db.update (increment completedCount)
    mockDb.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });
    // 2. db.select (query session sources)
    mockDb.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ id: 'src_test-new' }]),
      }),
    });
    // 3. db.update (update session meta)
    mockDb.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.sourceId).toBe('src_test-new');
    expect(mockCreateSource).toHaveBeenCalledTimes(1);
  });
});
