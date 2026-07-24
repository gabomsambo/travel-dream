/**
 * @jest-environment node
 *
 * The LLM processing routes take caller-supplied source/session ids. Both must
 * be scoped to the caller — otherwise a caller can run extraction over another
 * user's screenshots and file the resulting places under their own account.
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  generateSourceId: jest.fn().mockReturnValue('src_test-new'),
}));

jest.mock('@/lib/db-queries', () => ({
  getSourcesForLLMProcessing: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/db-mutations', () => ({
  batchCreatePlacesFromExtractions: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/llm-extraction-service', () => ({
  llmExtractionService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    updateConfig: jest.fn(),
    batchExtract: jest.fn().mockResolvedValue({ success: true, results: [] }),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { POST as LLM_POST } from '@/app/api/llm-process/route';
import { POST as BATCH_POST } from '@/app/api/llm-process/batch/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { llmExtractionService } from '@/lib/llm-extraction-service';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';
import { mockSelect, whereMentions } from '../helpers/authz-helpers';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock };
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockBatchExtract = llmExtractionService.batchExtract as jest.Mock;

const CALLER = createMockUser({ id: 'user_caller' });
const VICTIM_ID = 'user_victim';

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/llm-process', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const res = await LLM_POST(
      jsonRequest('http://localhost:3000/api/llm-process', { sourceIds: ['src_1'] })
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for another user's sessionId and never runs extraction", async () => {
    const select = mockSelect([createMockSession({ userId: VICTIM_ID })]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await LLM_POST(
      jsonRequest('http://localhost:3000/api/llm-process', { sessionId: 'session_test-1' })
    );

    expect(res.status).toBe(403);
    expect(mockBatchExtract).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown sessionId', async () => {
    const select = mockSelect([]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await LLM_POST(
      jsonRequest('http://localhost:3000/api/llm-process', { sessionId: 'session_nope' })
    );

    expect(res.status).toBe(404);
  });

  it("scopes an explicit sourceIds lookup to the caller, so another user's source is not processed", async () => {
    const select = mockSelect([]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await LLM_POST(
      jsonRequest('http://localhost:3000/api/llm-process', { sourceIds: ['src_victim-1'] })
    );
    const data = await res.json();

    expect(select.conditions).toHaveLength(1);
    expect(whereMentions(select.conditions[0], CALLER.id)).toBe(true);
    // Nothing matched under the caller's scope → nothing extracted
    expect(data.message).toBe('No sources require LLM processing');
    expect(mockBatchExtract).not.toHaveBeenCalled();
  });

  it('still processes the session for its owner', async () => {
    const select = mockSelect([
      createMockSession({ userId: CALLER.id, meta: { uploadedFiles: [], processingQueue: [], errors: [] } }),
    ]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await LLM_POST(
      jsonRequest('http://localhost:3000/api/llm-process', { sessionId: 'session_test-1' })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.message).toBe('No files to process in session');
  });

  it("scopes the session's source lookup to the caller", async () => {
    const sessionSelect = mockSelect([
      createMockSession({
        userId: CALLER.id,
        meta: { uploadedFiles: ['src_test-1'], processingQueue: [], errors: [] },
      }),
    ]);
    const sourceSelect = mockSelect([]);
    mockDb.select
      .mockReturnValueOnce(sessionSelect.chain)
      .mockReturnValue(sourceSelect.chain);

    await LLM_POST(
      jsonRequest('http://localhost:3000/api/llm-process', { sessionId: 'session_test-1' })
    );

    expect(sourceSelect.conditions.length).toBeGreaterThan(0);
    expect(whereMentions(sourceSelect.conditions[0], CALLER.id)).toBe(true);
  });
});

describe('POST /api/llm-process/batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const res = await BATCH_POST(
      jsonRequest('http://localhost:3000/api/llm-process/batch', { sessionIds: ['session_test-1'] })
    );

    expect(res.status).toBe(401);
  });

  it("scopes the sessionIds lookup to the caller, so another user's session yields nothing", async () => {
    const select = mockSelect([]);
    mockDb.select.mockReturnValue(select.chain);

    const res = await BATCH_POST(
      jsonRequest('http://localhost:3000/api/llm-process/batch', { sessionIds: ['session_victim-1'] })
    );
    const data = await res.json();

    expect(select.conditions.length).toBeGreaterThan(0);
    expect(whereMentions(select.conditions[0], CALLER.id)).toBe(true);
    expect(data.message).toBe('No sources require LLM processing');
    expect(mockBatchExtract).not.toHaveBeenCalled();
  });

  it("still returns the owner's own sessions' sources", async () => {
    const sessionSelect = mockSelect([
      createMockSession({
        userId: CALLER.id,
        meta: { uploadedFiles: ['src_test-1'], processingQueue: [], errors: [] },
      }),
    ]);
    const sourceSelect = mockSelect([
      { id: 'src_test-1', ocrText: 'a'.repeat(50), type: 'screenshot', lang: 'en', meta: {}, createdAt: '2026-03-01T00:00:00.000Z' },
    ]);
    mockDb.select
      .mockReturnValueOnce(sessionSelect.chain)
      .mockReturnValue(sourceSelect.chain);

    const res = await BATCH_POST(
      jsonRequest('http://localhost:3000/api/llm-process/batch', {
        sessionIds: ['session_test-1'],
        dryRun: true,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.preview.total_sources).toBe(1);
    // and the source lookup was itself scoped to the caller
    expect(whereMentions(sourceSelect.conditions[0], CALLER.id)).toBe(true);
  });
});
