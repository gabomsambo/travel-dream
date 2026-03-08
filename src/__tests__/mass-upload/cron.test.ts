/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock('@/lib/db-queries', () => ({
  getQueuedSources: jest.fn(),
}));
jest.mock('@/lib/db-mutations', () => ({
  createPlacesFromPipeline: jest.fn(),
}));
jest.mock('@/lib/mass-upload/gemini-extraction-service', () => ({
  geminiExtractionService: { extractFromImage: jest.fn() },
}));
jest.mock('@/lib/mass-upload/google-places-enrichment', () => ({
  googlePlacesEnrichmentService: { enrichPlaces: jest.fn() },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { GET } from '@/app/api/mass-upload/cron/route';
import { db } from '@/db';
import { getQueuedSources } from '@/lib/db-queries';
import { createPlacesFromPipeline } from '@/lib/db-mutations';
import { geminiExtractionService } from '@/lib/mass-upload/gemini-extraction-service';
import { googlePlacesEnrichmentService } from '@/lib/mass-upload/google-places-enrichment';
import {
  createMockSource,
  createMockExtractionResult,
  createMockPipelinePlace,
} from '../helpers/mass-upload-helpers';

const mockDb = db as unknown as { select: jest.Mock; update: jest.Mock };

// Cast mocks
const mockGetQueuedSources = getQueuedSources as jest.MockedFunction<typeof getQueuedSources>;
const mockCreatePlaces = createPlacesFromPipeline as jest.MockedFunction<typeof createPlacesFromPipeline>;
const mockExtract = geminiExtractionService.extractFromImage as jest.Mock;
const mockEnrich = googlePlacesEnrichmentService.enrichPlaces as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────
function setupStaleSourcesChain(staleSources: unknown[] = []) {
  const staleChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(staleSources),
    }),
  };
  return staleChain;
}

function setupRemainingCountChain(count: number = 0) {
  const remainingChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([{ count }]),
    }),
  };
  return remainingChain;
}

function setupUpdateChain(returnValue: unknown[] = []) {
  return {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(returnValue),
      }),
    }),
  };
}

function setupUpdateChainNoReturn() {
  return {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

describe('GET /api/mass-upload/cron', () => {
  const CRON_SECRET = 'test-cron-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.GEMINI_VISION_ENABLED = 'true';
  });

  it('rejects request without authorization header', async () => {
    const req = new Request('http://localhost/api/mass-upload/cron');
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('rejects request with wrong CRON_SECRET', async () => {
    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('returns empty result when no sources are queued', async () => {
    // Mock stale check → empty
    const staleChain = setupStaleSourcesChain([]);
    const remainingChain = setupRemainingCountChain(0);

    // select() calls: 1st = stale check
    mockDb.select.mockReturnValueOnce(staleChain);

    mockGetQueuedSources.mockResolvedValue([]);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(0);
  });

  it('recovers stale sources by requeuing when attempts < MAX_ATTEMPTS', async () => {
    const staleSource = createMockSource({
      id: 'src_stale-1',
      processingStatus: 'extracting',
      processingAttempts: 1,
      processingStartedAt: new Date(Date.now() - 300000).toISOString(), // 5 min ago
    });

    // Stale check returns one stale source
    const staleChain = setupStaleSourcesChain([staleSource]);
    mockDb.select.mockReturnValueOnce(staleChain);

    // Update to requeue stale source
    const updateChain = setupUpdateChainNoReturn();
    mockDb.update.mockReturnValueOnce(updateChain);

    // No queued sources after recovery
    mockGetQueuedSources.mockResolvedValue([]);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockDb.update).toHaveBeenCalled();
    // Verify it was set to 'queued' (requeued)
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.processingStatus).toBe('queued');
  });

  it('marks stale sources as failed when attempts >= MAX_ATTEMPTS', async () => {
    const staleSource = createMockSource({
      id: 'src_stale-2',
      processingStatus: 'extracting',
      processingAttempts: 3,
      processingStartedAt: new Date(Date.now() - 300000).toISOString(),
    });

    const staleChain = setupStaleSourcesChain([staleSource]);
    mockDb.select.mockReturnValueOnce(staleChain);

    const updateChain = setupUpdateChainNoReturn();
    mockDb.update.mockReturnValueOnce(updateChain);

    mockGetQueuedSources.mockResolvedValue([]);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.processingStatus).toBe('failed');
  });

  it('skips source grabbed by concurrent invocation (optimistic lock returns empty)', async () => {
    const source = createMockSource({ processingStatus: 'queued' });

    // Stale check → empty
    const staleChain = setupStaleSourcesChain([]);
    mockDb.select.mockReturnValueOnce(staleChain);

    mockGetQueuedSources.mockResolvedValue([source as never]);

    // Optimistic lock returns empty (concurrent grab)
    const claimChain = setupUpdateChain([]);
    mockDb.update.mockReturnValueOnce(claimChain);

    // Remaining count
    const remainingChain = setupRemainingCountChain(0);
    mockDb.select.mockReturnValueOnce(remainingChain);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(0);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('processes source through full pipeline', async () => {
    const source = createMockSource({
      processingStatus: 'queued',
      userId: 'user_test-1',
    });
    const claimedSource = {
      ...source,
      processingStatus: 'extracting',
      processingAttempts: 1,
    };

    // Stale check → empty
    const staleChain = setupStaleSourcesChain([]);
    mockDb.select.mockReturnValueOnce(staleChain);

    mockGetQueuedSources.mockResolvedValue([source as never]);

    // Optimistic lock → claimed
    const claimChain = setupUpdateChain([claimedSource]);
    mockDb.update.mockReturnValueOnce(claimChain);

    // fetch blob
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    // Gemini extraction
    mockExtract.mockResolvedValue(createMockExtractionResult());

    // Status update to enriching
    const enrichingChain = setupUpdateChainNoReturn();
    mockDb.update.mockReturnValueOnce(enrichingChain);

    // Google Places enrichment
    mockEnrich.mockResolvedValue([createMockPipelinePlace()]);

    // createPlacesFromPipeline
    mockCreatePlaces.mockResolvedValue([{ id: 'plc_test-1' }] as never);

    // Status update to completed
    const completedChain = setupUpdateChainNoReturn();
    mockDb.update.mockReturnValueOnce(completedChain);

    // Remaining count
    const remainingChain = setupRemainingCountChain(0);
    mockDb.select.mockReturnValueOnce(remainingChain);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(1);
    expect(data.placesCreated).toBe(1);
    expect(mockExtract).toHaveBeenCalledTimes(1);
    expect(mockEnrich).toHaveBeenCalledTimes(1);
    expect(mockCreatePlaces).toHaveBeenCalledTimes(1);
  });

  it('marks source failed after MAX_ATTEMPTS Gemini failures, requeues before that', async () => {
    const source = createMockSource({
      processingStatus: 'queued',
      userId: 'user_test-1',
    });

    // Source has reached max attempts (3)
    const claimedSource = {
      ...source,
      processingStatus: 'extracting',
      processingAttempts: 3,
    };

    // Stale check → empty
    const staleChain = setupStaleSourcesChain([]);
    mockDb.select.mockReturnValueOnce(staleChain);

    mockGetQueuedSources.mockResolvedValue([source as never]);

    // Optimistic lock → claimed with attempts=3
    const claimChain = setupUpdateChain([claimedSource]);
    mockDb.update.mockReturnValueOnce(claimChain);

    // fetch blob succeeds
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    // Gemini extraction fails
    mockExtract.mockRejectedValue(new Error('Gemini API error'));

    // Error handler updates status to failed (attempts >= MAX_ATTEMPTS)
    const failedChain = setupUpdateChainNoReturn();
    mockDb.update.mockReturnValueOnce(failedChain);

    // Remaining count
    const remainingChain = setupRemainingCountChain(0);
    mockDb.select.mockReturnValueOnce(remainingChain);

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.failed).toBe(1);
    // Verify it was marked as failed (not requeued)
    const setCall = failedChain.set.mock.calls[0][0];
    expect(setCall.processingStatus).toBe('failed');
  });
});
