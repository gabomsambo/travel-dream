/**
 * @jest-environment node
 *
 * The rule this file exists to protect: a screenshot that uploaded successfully
 * may never be marked `failed` because a run ran out of clock, was killed, or
 * raced another run. Interruptions requeue; only genuine verdicts about the
 * image consume an attempt.
 */

jest.mock('@/lib/db-mutations', () => ({
  claimNextQueuedSource: jest.fn(),
  markSourceEnriching: jest.fn(),
  cacheSourceProcessingWork: jest.fn(),
  completeSource: jest.fn(),
  recordSourceFailure: jest.fn(),
  recordSourceInterruption: jest.fn(),
  reclaimExpiredSourceLeases: jest.fn(),
  createPlacesFromPipeline: jest.fn(),
}));
jest.mock('@/lib/db-queries', () => ({
  getQueueDepth: jest.fn(),
}));
jest.mock('@/lib/mass-upload/gemini-extraction-service', () => ({
  getGeminiExtractionService: () => ({ extractFromImage: mockExtractFromImage }),
}));
jest.mock('@/lib/mass-upload/google-places-enrichment', () => {
  class GooglePlacesUnavailableError extends Error {}
  return {
    GooglePlacesUnavailableError,
    getGooglePlacesEnrichmentService: () => ({ enrichPlaces: mockEnrichPlaces }),
  };
});
jest.mock('sharp', () => jest.fn(() => ({
  resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from('thumb') }) }),
})));
jest.mock('@vercel/blob', () => ({
  put: jest.fn(async () => ({ url: 'https://store.public.blob.vercel-storage.com/thumb.jpg' })),
}));

const mockExtractFromImage = jest.fn();
const mockEnrichPlaces = jest.fn();

import { processQueue } from '@/lib/mass-upload/queue-processor';
import { QUEUE_CONFIG } from '@/lib/mass-upload/queue-config';
import { GooglePlacesUnavailableError } from '@/lib/mass-upload/google-places-enrichment';
import {
  claimNextQueuedSource,
  markSourceEnriching,
  cacheSourceProcessingWork,
  completeSource,
  recordSourceFailure,
  recordSourceInterruption,
  reclaimExpiredSourceLeases,
  createPlacesFromPipeline,
} from '@/lib/db-mutations';
import { getQueueDepth } from '@/lib/db-queries';
import { createMockSource, createMockExtractionResult, createMockPipelinePlace } from '../helpers/mass-upload-helpers';

const mockClaim = claimNextQueuedSource as jest.Mock;
const mockEnriching = markSourceEnriching as jest.Mock;
const mockCache = cacheSourceProcessingWork as jest.Mock;
const mockComplete = completeSource as jest.Mock;
const mockFailure = recordSourceFailure as jest.Mock;
const mockInterruption = recordSourceInterruption as jest.Mock;
const mockReclaim = reclaimExpiredSourceLeases as jest.Mock;
const mockCreatePlaces = createPlacesFromPipeline as jest.Mock;
const mockQueueDepth = getQueueDepth as jest.Mock;

/** Hand out the given sources, then report an empty queue. */
function queueOf(...sources: unknown[]) {
  let i = 0;
  mockClaim.mockImplementation(async () =>
    i < sources.length ? { source: sources[i++], contended: false } : { source: null, contended: false }
  );
}

function okImageResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => '1024' },
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

describe('processQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReclaim.mockResolvedValue({ requeued: 0, stalled: 0, ids: [] });
    mockQueueDepth.mockResolvedValue(0);
    mockEnriching.mockResolvedValue(true);
    mockCache.mockResolvedValue(true);
    mockComplete.mockResolvedValue(true);
    mockFailure.mockResolvedValue('queued');
    mockInterruption.mockResolvedValue('queued');
    mockCreatePlaces.mockResolvedValue([{ id: 'plc_1' }]);
    mockExtractFromImage.mockResolvedValue(createMockExtractionResult());
    mockEnrichPlaces.mockResolvedValue([createMockPipelinePlace()]);
    global.fetch = jest.fn().mockResolvedValue(okImageResponse()) as unknown as typeof fetch;
  });

  // ── The core distinction ─────────────────────────────────────────────

  it('records an interruption, NOT a failure, when the item watchdog fires', async () => {
    queueOf(createMockSource());
    // Extraction never resolves — the watchdog is what ends the item.
    mockExtractFromImage.mockImplementation(() => new Promise(() => {}));

    const result = await processQueue({
      workerId: 'w_test',
      deadlineAt: Date.now() + QUEUE_CONFIG.itemMinBudgetMs + 1_000,
    });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(1);
    expect(result.failed).toBe(0);
  }, 60_000);

  it('records an interruption when Gemini is overloaded (429/503), not a failure', async () => {
    queueOf(createMockSource());
    const overloaded = Object.assign(new Error('[503] The model is overloaded.'), { status: 503 });
    mockExtractFromImage.mockRejectedValue(overloaded);

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(1);
  });

  it('records an interruption when Google Places is unavailable', async () => {
    queueOf(createMockSource());
    mockEnrichPlaces.mockRejectedValue(new GooglePlacesUnavailableError('Google Places unavailable: HTTP 500'));

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(1);
  });

  it('records a genuine failure when the screenshot itself cannot be processed', async () => {
    queueOf(createMockSource());
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockFailure).toHaveBeenCalledTimes(1);
    expect(mockInterruption).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('treats a 5xx from blob storage as an interruption, not a bad screenshot', async () => {
    queueOf(createMockSource());
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502, headers: { get: () => null } });

    await processQueue({ workerId: 'w_test' });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
  });

  it('treats a blob download that hits its own timeout as an interruption', async () => {
    queueOf(createMockSource());
    // What AbortSignal.timeout rejects with: the item watchdog never fired, so
    // classification has to recognise the timeout on its own.
    const timedOut = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    (global.fetch as jest.Mock).mockRejectedValue(timedOut);

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(1);
  });

  it('treats a network drop wrapped by the Gemini SDK as an interruption', async () => {
    queueOf(createMockSource());
    mockExtractFromImage.mockRejectedValue(
      new Error(
        '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models: fetch failed'
      )
    );

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(1);
  });

  it('marks an oversized screenshot as a genuine failure', async () => {
    queueOf(createMockSource());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => String(QUEUE_CONFIG.maxImageBytes + 1) },
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    await processQueue({ workerId: 'w_test' });

    expect(mockFailure).toHaveBeenCalledTimes(1);
    expect(mockInterruption).not.toHaveBeenCalled();
  });

  // ── Clock discipline ─────────────────────────────────────────────────

  it('does not claim anything when less than one item budget of clock is left', async () => {
    queueOf(createMockSource());

    const result = await processQueue({
      workerId: 'w_test',
      deadlineAt: Date.now() + QUEUE_CONFIG.itemMinBudgetMs - 1_000,
    });

    expect(mockClaim).not.toHaveBeenCalled();
    expect(result.claimed).toBe(0);
    expect(result.stoppedBecause).toBe('deadline');
  });

  it('reclaims leases stranded by a killed run before claiming new work', async () => {
    mockReclaim.mockResolvedValue({ requeued: 3, stalled: 1, ids: ['a', 'b', 'c', 'd'] });
    queueOf();

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockReclaim).toHaveBeenCalledTimes(1);
    expect(result.reclaimed).toEqual({ requeued: 3, stalled: 1 });
    expect(result.stalled).toBe(1);
  });

  // ── Not paying twice ─────────────────────────────────────────────────

  it('reuses a cached extraction after an interruption instead of calling Gemini again', async () => {
    const extraction = createMockExtractionResult();
    queueOf(
      createMockSource({
        meta: {
          uploadInfo: { originalName: 'photo.jpg' },
          massUpload: { extraction, extractedAt: '2026-01-01T00:00:00.000Z', thumbnailUrl: 'https://x/thumb.jpg' },
        },
      })
    );

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockExtractFromImage).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled(); // the screenshot is not re-downloaded either
    expect(result.completed).toBe(1);
  });

  it('caches the extraction as soon as it is paid for, before enrichment can fail', async () => {
    queueOf(createMockSource());
    mockEnrichPlaces.mockRejectedValue(new GooglePlacesUnavailableError('down'));

    await processQueue({ workerId: 'w_test' });

    expect(mockCache).toHaveBeenCalledWith(
      'src_test-1',
      expect.any(String),
      expect.objectContaining({ extraction: expect.anything() })
    );
  });

  // ── Concurrency safety ───────────────────────────────────────────────

  it('does not count a completed item when the lease was lost', async () => {
    queueOf(createMockSource());
    mockComplete.mockResolvedValue(false);

    const result = await processQueue({ workerId: 'w_test' });

    expect(result.completed).toBe(0);
    expect(result.leaseLost).toBe(1);
    expect(mockFailure).not.toHaveBeenCalled();
  });

  it('treats losing the lease mid-item as an interruption', async () => {
    queueOf(createMockSource());
    mockEnriching.mockResolvedValue(false);

    const result = await processQueue({ workerId: 'w_test' });

    expect(mockInterruption).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(1);
  });

  it('gives every claimed item its own lease id', async () => {
    queueOf(createMockSource({ id: 'src_a' }), createMockSource({ id: 'src_b' }));

    await processQueue({ workerId: 'w_test' });

    const leases = mockClaim.mock.calls.map(([leaseId]) => leaseId);
    expect(new Set(leases).size).toBe(leases.length);
    expect(leases.every((l: string) => l.startsWith('w_test:'))).toBe(true);
  });

  it('completes normally and reports places created', async () => {
    queueOf(createMockSource());
    mockCreatePlaces.mockResolvedValue([{ id: 'plc_1' }, { id: 'plc_2' }]);
    mockQueueDepth.mockResolvedValue(7);

    const result = await processQueue({ workerId: 'w_test' });

    expect(result.completed).toBe(1);
    expect(result.placesCreated).toBe(2);
    expect(result.remaining).toBe(7);
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps working when another run took every candidate it saw', async () => {
    const source = createMockSource();
    let call = 0;
    mockClaim.mockImplementation(async () => {
      call++;
      if (call <= 2) return { source: null, contended: true };
      if (call === 3) return { source, contended: false };
      return { source: null, contended: false };
    });

    const result = await processQueue({ workerId: 'w_test' });

    expect(result.claimed).toBe(1);
    expect(result.completed).toBe(1);
  });

  it('reports contention rather than an empty queue when it never wins a candidate', async () => {
    mockClaim.mockResolvedValue({ source: null, contended: true });

    const result = await processQueue({ workerId: 'w_test' });

    expect(result.stoppedBecause).toBe('contended');
    expect(mockClaim.mock.calls.length).toBeGreaterThan(QUEUE_CONFIG.claimContentionRetries);
  });

  it('keeps a Gemini result that lands in the grace, writing it before the lease is released', async () => {
    jest.useFakeTimers();
    try {
      queueOf(createMockSource());
      const extraction = createMockExtractionResult();
      let resolveLate: (value: unknown) => void = () => {};
      mockExtractFromImage.mockImplementation(
        () => new Promise((resolve) => { resolveLate = resolve; })
      );

      const run = processQueue({ workerId: 'w_test' });
      await jest.advanceTimersByTimeAsync(QUEUE_CONFIG.itemMaxBudgetMs + 1_000);

      // Watchdog fired, but the item still owns its lease while it waits.
      expect(mockInterruption).not.toHaveBeenCalled();

      resolveLate(extraction);
      await jest.advanceTimersByTimeAsync(QUEUE_CONFIG.lateExtractionGraceMs);
      const result = await run;

      // The clock-out is an interruption, never a verdict about the image...
      expect(result.interrupted).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockFailure).not.toHaveBeenCalled();

      // ...and Gemini is not charged for it twice, because the write landed
      // while the lease that guards it was still held.
      expect(mockCache).toHaveBeenCalledWith(
        'src_test-1',
        expect.any(String),
        expect.objectContaining({ extraction })
      );
      expect(mockCache.mock.invocationCallOrder[0]).toBeLessThan(
        mockInterruption.mock.invocationCallOrder[0]
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips the grace entirely when the run has no clock left for it', async () => {
    jest.useFakeTimers();
    try {
      queueOf(createMockSource());
      const extraction = createMockExtractionResult();
      let resolveLate: (value: unknown) => void = () => {};
      mockExtractFromImage.mockImplementation(
        () => new Promise((resolve) => { resolveLate = resolve; })
      );

      const run = processQueue({
        workerId: 'w_test',
        deadlineAt: Date.now() + QUEUE_CONFIG.itemMinBudgetMs + 1_000,
      });
      await jest.advanceTimersByTimeAsync(QUEUE_CONFIG.itemMinBudgetMs + 2_000);
      const result = await run;

      expect(result.interrupted).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockCache).not.toHaveBeenCalled();

      // Even a result that arrives later is not waited for: the run is done.
      resolveLate(extraction);
      await jest.advanceTimersByTimeAsync(QUEUE_CONFIG.lateExtractionGraceMs);
      expect(mockCache).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops at maxItems', async () => {
    queueOf(...Array.from({ length: 10 }, (_, i) => createMockSource({ id: `src_${i}` })));

    const result = await processQueue({ workerId: 'w_test', maxItems: 2 });

    expect(result.claimed).toBe(2);
    expect(result.stoppedBecause).toBe('max-items');
  });
});
