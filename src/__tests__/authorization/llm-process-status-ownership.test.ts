/**
 * @jest-environment node
 *
 * GET /api/llm-process/status reads the extraction queue held by the
 * module-level `llmExtractionService` singleton. On a reused server instance
 * that queue holds every user's in-flight and finished extractions, so the
 * route must only ever return the caller's own entries — not other users'
 * source ids, providers, progress or counts.
 *
 * These tests drive the real service (only the LLM provider SDKs are faked) so
 * two users' batches genuinely share one queue, exactly as in production.
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
const mockProviderExtract = jest.fn();

// p-limit ships ESM only, which Jest's CJS runtime cannot load; concurrency
// limiting is irrelevant to what these tests prove.
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => <T>(fn: () => Promise<T>) => fn(),
}));

jest.mock('@/lib/llm-providers/openai-provider', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({
    name: 'openai',
    initialize: jest.fn().mockResolvedValue(undefined),
    extractFromSource: (...args: unknown[]) => mockProviderExtract(...args),
    isHealthy: jest.fn().mockResolvedValue(true),
    // Mirrors the real provider: cost totals accumulate across every user's calls.
    getProviderStats: jest.fn(async () => ({
      provider: 'openai',
      model: 'test-model',
      prompt_version: '1.0.0',
      cost_stats: [
        {
          provider: 'openai',
          total_requests: mockProviderExtract.mock.calls.length,
          total_input_tokens: 4242,
          total_output_tokens: 1717,
          total_cost_usd: 9.87,
        },
      ],
      health: { healthy: true, lastCheck: new Date().toISOString(), errors: [] },
    })),
    terminate: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/lib/llm-providers/anthropic-provider', () => ({
  AnthropicProvider: jest.fn(),
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/lib/db-queries', () => ({
  getLLMProcessingStats: jest.fn().mockResolvedValue({}),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/llm-process/status/route';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { llmExtractionService } from '@/lib/llm-extraction-service';
import type { ExtractionResult } from '@/types/llm-extraction';
import { createMockUser } from '../helpers/mass-upload-helpers';

const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

const ALICE = createMockUser({ id: 'user_alice', email: 'alice@example.com' });
const BOB = createMockUser({ id: 'user_bob', email: 'bob@example.com' });

const ALICE_DONE = 'src_alice-done';
const ALICE_INFLIGHT = 'src_alice-inflight';
const BOB_DONE = 'src_bob-done';

function extractionResult(sourceId: string): ExtractionResult {
  const now = new Date().toISOString();
  return {
    success: true,
    places: [],
    sourceId,
    metadata: {
      model: 'test-model',
      prompt_version: '1.0.0',
      processing_time_ms: 5,
      tokens_used: { input: 0, output: 0, total: 0 },
      cost_usd: 0,
      confidence_avg: 0,
      confidence_min: 0,
      confidence_max: 0,
      places_extracted: 0,
      retries: 0,
      errors: [],
      started_at: now,
      completed_at: now,
    },
  };
}

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 50 && !condition(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!condition()) throw new Error('condition never became true');
}

function statusRequest(query = '') {
  const req = new NextRequest(`http://localhost:3000/api/llm-process/status${query}`);
  // The jest.setup Request mock has no signal; the streaming branch listens on it.
  return Object.assign(req, { signal: new AbortController().signal });
}

async function getStatusAs(user: typeof ALICE, query = '') {
  mockRequireAuth.mockResolvedValue(user);
  const res = await GET(statusRequest(query));
  expect(res.status).toBe(200);
  const body = await res.json();
  return { raw: JSON.stringify(body), body };
}

let releaseAliceInflight: () => void = () => {};
let aliceBatch: Promise<unknown>;

beforeAll(async () => {
  llmExtractionService.updateConfig({
    primaryProvider: 'openai',
    enableFallback: false,
    providers: {
      openai: {
        apiKey: 'test-key',
        model: 'test-model',
        maxTokens: 100,
        temperature: 0,
        timeout: 1000,
        retryAttempts: 0,
        rateLimitPerMinute: 60,
        costLimitPerDay: 1,
      },
    },
  });

  const inflight = new Promise<void>((resolve) => {
    releaseAliceInflight = resolve;
  });
  mockProviderExtract.mockImplementation(async (sourceId: string) => {
    if (sourceId === ALICE_INFLIGHT) await inflight;
    return extractionResult(sourceId);
  });

  // Alice: one finished extraction and one still running.
  aliceBatch = llmExtractionService.batchExtract(
    [
      { id: ALICE_DONE, text: 'alice finished text' },
      { id: ALICE_INFLIGHT, text: 'alice running text' },
    ],
    { userId: ALICE.id, maxConcurrent: 2 }
  );
  // Bob: one finished extraction, on the same (shared) service instance.
  await llmExtractionService.batchExtract([{ id: BOB_DONE, text: 'bob finished text' }], {
    userId: BOB.id,
  });

  await waitFor(
    () =>
      llmExtractionService.getProcessingStatus(ALICE_DONE, ALICE.id)?.status === 'completed' &&
      llmExtractionService.getProcessingStatus(ALICE_INFLIGHT, ALICE.id)?.status === 'processing'
  );
});

afterAll(async () => {
  releaseAliceInflight();
  await aliceBatch;
});

describe('llmExtractionService queue readers', () => {
  it('only return entries owned by the requested user', () => {
    expect(
      llmExtractionService.getAllProcessingStatuses(BOB.id).map((s) => s.sourceId)
    ).toEqual([BOB_DONE]);
    expect(
      llmExtractionService.getAllProcessingStatuses(ALICE.id).map((s) => s.sourceId).sort()
    ).toEqual([ALICE_DONE, ALICE_INFLIGHT]);
    expect(llmExtractionService.getProcessingStatus(ALICE_INFLIGHT, BOB.id)).toBeUndefined();
  });
});

describe('GET /api/llm-process/status', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it('rejects unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(statusRequest());
    expect(res.status).toBe(401);
  });

  it("does not show user B any of user A's processing entries", async () => {
    const { raw, body } = await getStatusAs(BOB);

    expect(raw).not.toContain('src_alice');
    expect(body.queue).toEqual({ active: 0, pending: 0, completed: 1, failed: 0, total: 1 });
    expect(body.processing.current_items).toEqual([]);
    expect(body.processing.recent_completions.map((c: { sourceId: string }) => c.sourceId)).toEqual([
      BOB_DONE,
    ]);
  });

  it("does not show user B process-wide cost or token totals from user A's extractions", async () => {
    const { raw, body } = await getStatusAs(BOB);

    expect(raw).not.toContain('cost_stats');
    expect(raw).not.toContain('total_requests');
    expect(raw).not.toContain('4242');
    expect(raw).not.toContain('9.87');
    expect(body.service.providers.openai).toEqual({
      provider: 'openai',
      model: 'test-model',
      prompt_version: '1.0.0',
      healthy: true,
    });
  });

  it("still shows user A their own in-flight and completed entries", async () => {
    const { raw, body } = await getStatusAs(ALICE);

    expect(raw).not.toContain('src_bob');
    expect(body.queue).toEqual({ active: 1, pending: 0, completed: 1, failed: 0, total: 2 });
    expect(body.processing.current_items.map((c: { sourceId: string }) => c.sourceId)).toEqual([
      ALICE_INFLIGHT,
    ]);
    expect(body.processing.recent_completions.map((c: { sourceId: string }) => c.sourceId)).toEqual([
      ALICE_DONE,
    ]);
  });

  it("does not match user A's sources through the sessionId filter", async () => {
    const { body } = await getStatusAs(BOB, '?sessionId=alice');
    expect(body.session).toBeUndefined();
  });

  it("does not stream user A's entries to user B", async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      mockRequireAuth.mockResolvedValue(BOB);
      const res = await GET(statusRequest('?stream=true&sessionId=alice'));
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      await reader.cancel();
      const firstEvents = new TextDecoder().decode(value);

      expect(firstEvents).toContain('event: status');
      expect(firstEvents).toContain(BOB_DONE);
      expect(firstEvents).not.toContain('src_alice');
      expect(firstEvents).not.toContain('event: session_progress');
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
