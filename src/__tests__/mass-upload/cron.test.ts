/**
 * @jest-environment node
 *
 * The cron is now a safety net: it reclaims stranded work, tops the worker pool
 * back up, and takes a share of the queue itself. The per-item reliability rules
 * live in queue-processor.test.ts.
 */

jest.mock('@/lib/mass-upload/queue-processor', () => ({
  processQueue: jest.fn(),
}));
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn(),
}));

import { GET } from '@/app/api/mass-upload/cron/route';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';

const mockProcessQueue = processQueue as jest.Mock;
const mockDispatch = dispatchProcessors as jest.Mock;

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

  it('returns 500 when the run itself blows up', async () => {
    mockProcessQueue.mockRejectedValue(new Error('database unreachable'));

    const res = await GET(cronRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('database unreachable');
  });
});
