/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/db-utils', () => ({
  withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    // Simulate transaction by calling fn with a mock tx
    const tx = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'src_test-new' }]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: 'src_test-new' }]),
        }),
      }),
    };
    return fn(tx);
  }),
  generateSourceId: jest.fn().mockReturnValue('src_test-new'),
}));

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST } from '@/app/api/mass-upload/register/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock; transaction: jest.Mock };

const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

// ── Mock fetch for SHA-1 hashing ──────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

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

function mockBlobFetchSuccess() {
  const imageBuffer = Buffer.from('fake-image-content');
  mockFetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: () => Promise.resolve(imageBuffer.buffer),
  });
}

function mockSessionSelect(session: ReturnType<typeof createMockSession> | null) {
  const selectChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(session),
      }),
    }),
  };
  mockDb.select.mockReturnValueOnce(selectChain);
}

function mockDedupSelectNoMatch() {
  // Duplicate detection query returns no match
  const dedupChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
  };
  mockDb.select.mockReturnValueOnce(dedupChain);
}

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
    mockSessionSelect(null);

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('Session not found');
  });

  it('returns 403 when session belongs to different user', async () => {
    const session = createMockSession({ userId: 'other-user' });
    mockSessionSelect(session);

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain('Forbidden');
  });

  it('creates source and returns success on happy path', async () => {
    const session = createMockSession();

    // 1. Session lookup
    mockSessionSelect(session);

    // 2. Mock blob fetch for SHA-1 computation
    mockBlobFetchSuccess();

    // 3. Duplicate detection returns no match
    mockDedupSelectNoMatch();

    // withTransaction mock handles the rest (insert, update, select inside tx)

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.sourceId).toBe('src_test-new');
  });

  it('returns duplicate when same hash exists in same session', async () => {
    const session = createMockSession();

    // 1. Session lookup
    mockSessionSelect(session);

    // 2. Mock blob fetch for SHA-1 computation
    mockBlobFetchSuccess();

    // 3. Duplicate detection returns existing source from same session
    const existingSource = {
      id: 'src_existing',
      uri: 'https://blob.vercel-storage.com/existing.jpg',
      meta: { uploadInfo: { sessionId: validBody.sessionId } },
      processingStatus: 'uploaded',
    };
    const dedupChain = {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(existingSource),
          }),
        }),
      }),
    };
    mockDb.select.mockReturnValueOnce(dedupChain);

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('duplicate');
    expect(data.sourceId).toBe('src_existing');
  });

  it('returns 502 when blob fetch fails', async () => {
    const session = createMockSession();

    // 1. Session lookup
    mockSessionSelect(session);

    // 2. Mock blob fetch failure
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.message).toContain('Failed to fetch blob');
  });

  it('falls back to random hash when blob fetch throws', async () => {
    const session = createMockSession();

    // 1. Session lookup
    mockSessionSelect(session);

    // 2. Mock blob fetch throws
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // 3. Duplicate detection returns no match (fallback hash won't match anything)
    mockDedupSelectNoMatch();

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
  });
});
