/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/db/schema/sources-current', () => ({
  sourcesCurrentSchema: {
    id: 'id',
    processingStatus: 'processingStatus',
    processingError: 'processingError',
  },
}));

jest.mock('@/lib/db-queries', () => ({
  getProcessingStatusCounts: jest.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { GET } from '@/app/api/mass-upload/status/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { getProcessingStatusCounts } from '@/lib/db-queries';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';

const mockDb = db as unknown as { select: jest.Mock };
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockGetProcessingStatusCounts = getProcessingStatusCounts as jest.MockedFunction<
  typeof getProcessingStatusCounts
>;

// ── Helpers ────────────────────────────────────────────────────────────
function createStatusRequest(sessionId?: string) {
  const url = sessionId
    ? `http://localhost:3000/api/mass-upload/status?sessionId=${sessionId}`
    : 'http://localhost:3000/api/mass-upload/status';
  return new Request(url, { method: 'GET' });
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

function mockPlacesCountSelect(count: number) {
  const selectChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([{ count }]),
    }),
  };
  mockDb.select.mockReturnValueOnce(selectChain);
}

function mockFailedSourcesSelect(
  sources: Array<{ id: string; processingError: string | null }>
) {
  const selectChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(sources),
    }),
  };
  mockDb.select.mockReturnValueOnce(selectChain);
}

// ── Test Suite ─────────────────────────────────────────────────────────
describe('GET /api/mass-upload/status', () => {
  const mockUser = createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(mockUser);
  });

  // ── 1. Authentication ────────────────────────────────────────────────
  it('rejects unauthenticated request with 401', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Authentication required');
  });

  // ── 2. Missing sessionId ─────────────────────────────────────────────
  it('returns 400 when sessionId query param is missing', async () => {
    const req = createStatusRequest(); // no sessionId
    const res = await GET(req as never);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.message).toContain('sessionId query parameter required');
  });

  // ── 3. Session not found ─────────────────────────────────────────────
  it('returns 404 when session does not exist', async () => {
    mockSessionSelect(null);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.message).toContain('Session not found');
  });

  // ── 4. Forbidden – session belongs to a different user ───────────────
  it('returns 403 when session belongs to a different user', async () => {
    const session = createMockSession({ userId: 'other-user-id' });
    mockSessionSelect(session);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.message).toContain('Forbidden');
  });

  // ── 5. Correct status counts for a session with mixed source states ───
  it('returns correct status counts for a session with mixed source states', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_1', 'src_2', 'src_3', 'src_4', 'src_5'],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockResolvedValueOnce({
      uploaded: 1,
      queued: 1,
      extracting: 1,
      completed: 1,
      failed: 1,
    });

    mockPlacesCountSelect(0);
    mockFailedSourcesSelect([]);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.counts).toEqual({
      uploaded: 1,
      queued: 1,
      extracting: 1,
      enriching: 0,
      completed: 1,
      failed: 1,
      cancelled: 0,
    });
  });

  // ── 6. placesCreated count ───────────────────────────────────────────
  it('returns correct placesCreated count', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_1', 'src_2'],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockResolvedValueOnce({ completed: 2 });
    mockPlacesCountSelect(3);
    mockFailedSourcesSelect([]);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.placesCreated).toBe(3);
  });

  // ── 7. failedErrors array ────────────────────────────────────────────
  it('returns failedErrors array populated from failed sources', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_1', 'src_2', 'src_3'],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockResolvedValueOnce({
      completed: 2,
      failed: 1,
    });

    mockPlacesCountSelect(2);

    mockFailedSourcesSelect([
      { id: 'src_3', processingError: 'LLM extraction timed out' },
    ]);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.failedErrors).toHaveLength(1);
    expect(data.failedErrors[0]).toEqual({
      sourceId: 'src_3',
      error: 'Processing timed out after multiple attempts',
    });
  });

  // ── 8. failedErrors filters out sources with no error message ────────
  it('excludes failed sources that have no processingError message', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_1', 'src_2'],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockResolvedValueOnce({ failed: 2 });
    mockPlacesCountSelect(0);

    // One failed source has an error message, one has null
    mockFailedSourcesSelect([
      { id: 'src_1', processingError: 'Quota exceeded' },
      { id: 'src_2', processingError: null },
    ]);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.failedErrors).toHaveLength(1);
    expect(data.failedErrors[0].sourceId).toBe('src_1');
    // Raw error is mapped to user-friendly message
    expect(data.failedErrors[0].error).toBe('Rate limit exceeded after multiple attempts');
  });

  // ── 8b. Error messages are mapped to user-friendly strings ─────────
  it('maps raw API errors to user-friendly messages', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_1', 'src_2', 'src_3', 'src_4', 'src_5'],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);
    mockGetProcessingStatusCounts.mockResolvedValueOnce({ failed: 5 });
    mockPlacesCountSelect(0);

    mockFailedSourcesSelect([
      { id: 'src_1', processingError: '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.' },
      { id: 'src_2', processingError: 'fetch failed: ECONNRESET' },
      { id: 'src_3', processingError: 'Request timed out after 120s' },
      { id: 'src_4', processingError: 'INVALID_ARGUMENT: image too small' },
      { id: 'src_5', processingError: 'Something completely unexpected' },
    ]);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);
    const data = await res.json();

    expect(data.failedErrors[0].error).toBe('AI service was unavailable after multiple attempts');
    expect(data.failedErrors[1].error).toBe('Network error during processing');
    expect(data.failedErrors[2].error).toBe('Processing timed out after multiple attempts');
    expect(data.failedErrors[3].error).toBe('Could not process this image');
    expect(data.failedErrors[4].error).toBe('Processing failed after multiple attempts');
  });

  // ── 9. total reflects session uploadedFiles length ───────────────────
  it('returns total equal to the number of uploadedFiles in the session', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_1', 'src_2', 'src_3', 'src_4'],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockResolvedValueOnce({ completed: 4 });
    mockPlacesCountSelect(4);
    mockFailedSourcesSelect([]);

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(4);
    expect(data.sessionId).toBe('session_test-1');
  });

  // ── 10. Empty session – no sources ──────────────────────────────────
  it('handles session with no uploaded sources and returns zeroed counts', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: [],
        processingQueue: [],
        errors: [],
      },
    });
    mockSessionSelect(session);

    // The route always calls getProcessingStatusCounts; the empty-array
    // short-circuit is inside db-queries.ts, invisible to our mock.
    mockGetProcessingStatusCounts.mockResolvedValueOnce({});

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(data.total).toBe(0);
    expect(data.placesCreated).toBe(0);
    expect(data.failedErrors).toEqual([]);
    expect(data.counts).toEqual({
      uploaded: 0,
      queued: 0,
      extracting: 0,
      enriching: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    });
    // Neither the places count query nor the failed sources query should be called
    // (only the session select was called; select should have been called exactly once)
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  // ── 11. Response shape includes timestamp and sessionId ──────────────
  it('response always includes a timestamp and the echoed sessionId', async () => {
    const session = createMockSession();
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockResolvedValueOnce({ completed: 2 });
    mockPlacesCountSelect(1);
    mockFailedSourcesSelect([]);

    const before = Date.now();
    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);
    const after = Date.now();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBe('session_test-1');
    expect(typeof data.timestamp).toBe('string');
    const ts = new Date(data.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });

  // ── 12. Unexpected DB error returns 500 ─────────────────────────────
  it('returns 500 when an unexpected database error occurs', async () => {
    const session = createMockSession();
    mockSessionSelect(session);

    mockGetProcessingStatusCounts.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = createStatusRequest('session_test-1');
    const res = await GET(req as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.message).toContain('DB connection lost');
  });
});
