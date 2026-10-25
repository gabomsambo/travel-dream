/**
 * @jest-environment node
 */

const afterCallbacks: Array<() => unknown> = [];

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn().mockResolvedValue({ spawned: 0 }),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn);
    },
  };
});

function createTx(options: {
  sessionMeta?: { processingStarted?: boolean } | null;
  siblingIds?: string[];
} = {}) {
  const sessionMeta = options.sessionMeta === undefined ? null : options.sessionMeta;
  const siblingIds = options.siblingIds ?? [];
  const statusSets: Array<Record<string, unknown>> = [];
  let limitCalls = 0;

  const tx = {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'src_test-new' }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockImplementation((values: Record<string, unknown>) => {
        if ('processingStatus' in values) statusSets.push(values);
        return {
          where: jest.fn().mockImplementation(() => {
            const pending = Promise.resolve(undefined) as Promise<undefined> & { returning: jest.Mock };
            pending.returning = jest.fn().mockResolvedValue([{ status: 'active' }]);
            return pending;
          }),
        };
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => ({
          // First `.limit(1)` is session meta; a second is the sibling probe
          // (skipped when meta.processingStarted is already true). A bare
          // await rebuilds uploadedFiles from session sources.
          limit: () => {
            limitCalls += 1;
            if (limitCalls === 1) return Promise.resolve([{ meta: sessionMeta }]);
            return Promise.resolve(siblingIds.map((id) => ({ id })));
          },
          then(
            onFulfilled?: (value: Array<{ id: string }>) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) {
            const ids = [
              ...siblingIds.map((id) => ({ id })),
              { id: 'src_test-new' },
            ];
            return Promise.resolve(ids).then(onFulfilled, onRejected);
          },
        })),
      }),
    }),
    statusSets,
  };
  return tx;
}

jest.mock('@/lib/db-utils', () => ({
  withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(createTx())),
  generateSourceId: jest.fn().mockReturnValue('src_test-new'),
}));

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST } from '@/app/api/mass-upload/register/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { withTransaction } from '@/lib/db-utils';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { del } from '@vercel/blob';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';

const mockDispatch = dispatchProcessors as jest.Mock;

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
  blobUrl: 'https://teststore.public.blob.vercel-storage.com/test-image.jpg',
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

function referenceSelect(rows: Array<{ id: string }>) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe('POST /api/mass-upload/register', () => {
  const mockUser = createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    afterCallbacks.length = 0;
    mockRequireAuth.mockResolvedValue(mockUser);
    mockDb.select.mockImplementation(() => referenceSelect([]));
    (withTransaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(createTx()),
    );
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
    const tx = createTx();
    (withTransaction as jest.Mock).mockImplementationOnce(async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    // 1. Session lookup
    mockSessionSelect(session);

    // 2. Mock blob fetch for SHA-1 computation
    mockBlobFetchSuccess();

    // 3. Duplicate detection returns no match
    mockDedupSelectNoMatch();

    const req = createRegisterRequest(validBody);
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.sourceId).toBe('src_test-new');
    expect(tx.statusSets).toEqual([
      expect.objectContaining({ processingStatus: 'uploaded' }),
    ]);
    expect(afterCallbacks).toHaveLength(0);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('inserts as queued and dispatches when the session was already started', async () => {
    const session = createMockSession({
      meta: {
        uploadedFiles: ['src_earlier'],
        errors: [],
        processingStarted: true,
      },
    });
    const tx = createTx({
      sessionMeta: { processingStarted: true },
      siblingIds: ['src_earlier'],
    });
    (withTransaction as jest.Mock).mockImplementationOnce(async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    mockSessionSelect(session);
    mockBlobFetchSuccess();
    mockDedupSelectNoMatch();

    const res = await POST(createRegisterRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.sourceId).toBe('src_test-new');
    expect(tx.statusSets).toEqual([
      expect.objectContaining({ processingStatus: 'queued' }),
    ]);
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(mockDispatch).toHaveBeenCalledWith('register-late', 'grow');
  });

  it('inserts as queued when a sibling source is already past uploaded', async () => {
    const session = createMockSession();
    const tx = createTx({
      sessionMeta: null,
      siblingIds: ['src_queued_sibling'],
    });
    (withTransaction as jest.Mock).mockImplementationOnce(async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    mockSessionSelect(session);
    mockBlobFetchSuccess();
    mockDedupSelectNoMatch();

    const res = await POST(createRegisterRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(tx.statusSets).toEqual([
      expect.objectContaining({ processingStatus: 'queued' }),
    ]);
    expect(afterCallbacks).toHaveLength(1);
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
      uri: 'https://teststore.public.blob.vercel-storage.com/existing.jpg',
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

  it('does not register a screenshot once the session is closed', async () => {
    mockSessionSelect(createMockSession({ status: 'cancelled' }));

    const res = await POST(createRegisterRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.message).toContain('closed');
    expect(mockDb.select).toHaveBeenCalledTimes(5);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(validBody.blobUrl);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps a blob another tenant still references when the session is closed', async () => {
    mockSessionSelect(createMockSession({ status: 'cancelled' }));
    mockDb.select.mockReturnValueOnce(referenceSelect([{ id: 'src_other_tenant' }]));

    const res = await POST(createRegisterRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.message).toContain('closed');
    expect(del).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('drops a screenshot whose register finishes after the session is closed', async () => {
    mockSessionSelect(createMockSession());
    mockBlobFetchSuccess();
    mockDedupSelectNoMatch();
    const insert = jest.fn();
    (withTransaction as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ status: 'cancelled' }]),
            }),
          }),
        }),
        insert,
        select: jest.fn(),
      };
      return fn(tx);
    });

    const res = await POST(createRegisterRequest(validBody) as never);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.status).toBe('error');
    expect(insert).not.toHaveBeenCalled();
    expect(mockDb.select).toHaveBeenCalledTimes(6);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(validBody.blobUrl);
  });

  it('keeps a referenced blob when register loses the race to cancel', async () => {
    mockSessionSelect(createMockSession());
    mockBlobFetchSuccess();
    mockDedupSelectNoMatch();
    mockDb.select.mockReturnValueOnce(referenceSelect([{ id: 'att_other_tenant' }]));
    const insert = jest.fn();
    (withTransaction as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ status: 'cancelled' }]),
            }),
          }),
        }),
        insert,
      };
      return fn(tx);
    });

    const res = await POST(createRegisterRequest(validBody) as never);

    expect(res.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
