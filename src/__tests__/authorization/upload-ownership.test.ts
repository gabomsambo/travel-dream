/**
 * @jest-environment node
 *
 * Upload routes take caller-supplied source ids and session ids. A caller must
 * never be able to OCR another user's screenshot, nor append their own uploads
 * to another user's session.
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  generateSourceId: jest.fn().mockReturnValue('src_test-new'),
}));

jest.mock('@/lib/db-mutations', () => ({
  createSource: jest.fn().mockResolvedValue({ id: 'src_test-new' }),
  batchCreatePlacesFromExtractions: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/llm-extraction-service', () => ({
  llmExtractionService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    updateConfig: jest.fn(),
    batchExtract: jest.fn().mockResolvedValue({ success: true, results: [] }),
  },
}));

jest.mock('@/lib/ocr-service-server', () => ({
  ocrServiceServer: {
    processImageBuffer: jest.fn().mockResolvedValue({
      text: 'short',
      confidence: 0.9,
      processingTime: 5,
    }),
  },
  OCRServiceServer: {
    validateImageBuffer: jest.fn().mockReturnValue({ isValid: true }),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST as PROCESS_POST, GET as PROCESS_GET } from '@/app/api/upload/process/route';
import { POST as BLOB_COMPLETE_POST } from '@/app/api/upload/blob-complete/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { createSource } from '@/lib/db-mutations';
import { ocrServiceServer } from '@/lib/ocr-service-server';
import { createMockUser, createMockSession, createMockSource } from '../helpers/mass-upload-helpers';
import { mockSelect, mockUpdate, whereMentions } from '../helpers/authz-helpers';

const mockDb = db as unknown as {
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
  transaction: jest.Mock;
};
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockCreateSource = createSource as jest.Mock;
const mockOcr = ocrServiceServer.processImageBuffer as jest.Mock;

const CALLER = createMockUser({ id: 'user_caller' });
const VICTIM_ID = 'user_victim';
const BLOB_URL = 'https://teststore.public.blob.vercel-storage.com/a.jpg';

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/upload/process', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
    mockDb.update.mockImplementation(() => mockUpdate());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as unknown as typeof fetch;
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const res = await PROCESS_POST(
      jsonRequest('http://localhost:3000/api/upload/process', { sourceIds: ['src_test-1'] })
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 for another user's sourceId and never runs OCR", async () => {
    // Ownership-scoped lookup matches nothing for a non-owner
    const select = mockSelect([]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await PROCESS_POST(
      jsonRequest('http://localhost:3000/api/upload/process', { sourceIds: ['src_victim-1'] })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    // Existence is not leaked: same shape as a genuinely unknown id
    expect(data.message).toBe('Source not found');
    expect(mockOcr).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('scopes the source lookup to the calling user', async () => {
    const select = mockSelect([]);
    mockDb.select.mockReturnValue(select.chain);

    await PROCESS_POST(
      jsonRequest('http://localhost:3000/api/upload/process', { sourceIds: ['src_victim-1'] })
    );

    expect(select.conditions).toHaveLength(1);
    expect(whereMentions(select.conditions[0], CALLER.id)).toBe(true);
    expect(whereMentions(select.conditions[0], 'src_victim-1')).toBe(true);
  });

  it('still OCRs the source for its owner', async () => {
    const select = mockSelect([
      createMockSource({ id: 'src_test-1', userId: CALLER.id, uri: BLOB_URL }),
    ]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await PROCESS_POST(
      jsonRequest('http://localhost:3000/api/upload/process', { sourceIds: ['src_test-1'] })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.summary.successful).toBe(1);
    expect(mockOcr).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/upload/process', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
  });

  it("returns 404 for another user's sourceId instead of its OCR text", async () => {
    const select = mockSelect([]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await PROCESS_GET(
      new Request('http://localhost:3000/api/upload/process?sourceId=src_victim-1') as never
    );

    expect(res.status).toBe(404);
    expect(whereMentions(select.conditions[0], CALLER.id)).toBe(true);
  });

  it("still returns the owner's own OCR status", async () => {
    const select = mockSelect([
      createMockSource({ id: 'src_test-1', userId: CALLER.id, ocrText: 'hello world' }),
    ]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await PROCESS_GET(
      new Request('http://localhost:3000/api/upload/process?sourceId=src_test-1') as never
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ocrText).toBe('hello world');
  });
});

describe('POST /api/upload/blob-complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
    mockDb.update.mockImplementation(() => mockUpdate());
    mockDb.insert.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        update: mockUpdate,
        select: () => mockSelect([createMockSession({ userId: CALLER.id })]).chain,
      })
    );
  });

  const body = {
    sessionId: 'session_test-1',
    blobUrl: BLOB_URL,
    originalName: 'photo.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
  };

  it("returns 403 for another user's session and creates no source", async () => {
    const select = mockSelect([createMockSession({ userId: VICTIM_ID })]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await BLOB_COMPLETE_POST(
      jsonRequest('http://localhost:3000/api/upload/blob-complete', body)
    );

    expect(res.status).toBe(403);
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it("still completes the upload for the session's owner", async () => {
    const select = mockSelect([createMockSession({ userId: CALLER.id })]);
    mockDb.select.mockReturnValue(select.chain);
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        update: jest.fn(() => mockUpdate()),
        select: jest.fn(() => mockSelect([createMockSession({ userId: CALLER.id })]).chain),
      })
    );

    const res = await BLOB_COMPLETE_POST(
      jsonRequest('http://localhost:3000/api/upload/blob-complete', body)
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(mockCreateSource).toHaveBeenCalledTimes(1);
  });
});
