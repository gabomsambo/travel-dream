/**
 * @jest-environment node
 *
 * What the cron is responsible for is documented on `GET` in
 * `src/app/api/mass-upload/cron/route.ts`. Per-item reliability rules live in
 * queue-processor.test.ts.
 */

jest.mock('@/lib/mass-upload/queue-processor', () => ({
  processQueue: jest.fn(),
}));
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn(),
}));
jest.mock('@/lib/db-mutations', () => ({
  requeueStaleUploadedSources: jest.fn(),
}));

import { GET } from '@/app/api/mass-upload/cron/route';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { requeueStaleUploadedSources } from '@/lib/db-mutations';

const mockProcessQueue = processQueue as jest.Mock;
const mockDispatch = dispatchProcessors as jest.Mock;
const mockRequeueUploaded = requeueStaleUploadedSources as jest.Mock;

const CRON_SECRET = 'test-cron-secret';

function cronRequest(secret: string | null = CRON_SECRET) {
  return new Request('http://localhost/api/mass-upload/cron', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  }) as never;
}

function queueResult(overrides: Record<string, unknown> = {}) {
  return {
    workerId: 'w_cron',
    claimed: 2,
    completed: 2,
    failed: 0,
    interrupted: 1,
    stalled: 0,
    leaseLost: 0,
    placesCreated: 5,
    claimErrors: 0,
    outcomeErrors: 0,
    reclaimed: { requeued: 3, stalled: 0 },
    remaining: 4,
    stoppedBecause: 'queue-empty',
    elapsedMs: 1234,
    ...overrides,
  };
}

describe('GET /api/mass-upload/cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.GEMINI_VISION_ENABLED = 'true';
    mockDispatch.mockResolvedValue({ queued: 4, activeWorkers: 0, desiredWorkers: 1, spawned: 1 });
    mockRequeueUploaded.mockResolvedValue({ requeued: 0, ids: [] });
    mockProcessQueue.mockResolvedValue(queueResult());
  });

  it('rejects a request without an authorization header', async () => {
    const res = await GET(cronRequest(null));
    expect(res.status).toBe(401);
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong secret', async () => {
    const res = await GET(cronRequest('wrong'));
    expect(res.status).toBe(401);
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest('anything'));
    expect(res.status).toBe(500);
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });

  it('tops the worker pool up and also drains the queue itself', async () => {
    const res = await GET(cronRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledWith('safety-net-cron', 'grow');
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
    expect(data.processed).toBe(2);
    expect(data.placesCreated).toBe(5);
    expect(data.remaining).toBe(4);
    expect(data.dispatch.spawned).toBe(1);
  });

  it('recovers stale uploaded sources before dispatching workers', async () => {
    mockRequeueUploaded.mockResolvedValue({ requeued: 2, ids: ['src_a', 'src_b'] });

    const data = await (await GET(cronRequest())).json();

    expect(mockRequeueUploaded).toHaveBeenCalledTimes(1);
    expect(mockRequeueUploaded.mock.invocationCallOrder[0])
      .toBeLessThan(mockDispatch.mock.invocationCallOrder[0]);
    expect(data.uploadedRequeued).toBe(2);
  });

  it('reports interruptions and reclaims separately from failures', async () => {
    mockProcessQueue.mockResolvedValue(
      queueResult({ failed: 0, interrupted: 2, stalled: 1, reclaimed: { requeued: 5, stalled: 1 } })
    );

    const data = await (await GET(cronRequest())).json();

    expect(data.failed).toBe(0);
    expect(data.interrupted).toBe(2);
    expect(data.stalled).toBe(1);
    expect(data.reclaimed).toEqual({ requeued: 5, stalled: 1 });
  });

  it('reports the infrastructure errors that cut lanes short', async () => {
    mockProcessQueue.mockResolvedValue(
      queueResult({
        claimErrors: 2,
        claimError: 'Database operation failed in claimNextQueuedSource: stream closed',
        outcomeErrors: 1,
        outcomeError: 'Database operation failed in recordSourceInterruption: SQLITE_BUSY',
        stoppedBecause: 'claim-error',
      })
    );

    const data = await (await GET(cronRequest())).json();

    expect(data.claimErrors).toBe(2);
    expect(data.claimError).toMatch(/stream closed/);
    expect(data.outcomeErrors).toBe(1);
    expect(data.outcomeError).toMatch(/SQLITE_BUSY/);
    expect(data.stoppedBecause).toBe('claim-error');
    // Legacy field names clients depend on are untouched.
    expect(data.processed).toBe(2);
    expect(data.remaining).toBe(4);
  });

  it('returns 500 when the run itself blows up', async () => {
    mockProcessQueue.mockRejectedValue(new Error('database unreachable'));

    const res = await GET(cronRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('database unreachable');
  });
});
