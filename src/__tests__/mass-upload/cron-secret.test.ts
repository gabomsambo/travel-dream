/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/lib/mass-upload/queue-processor', () => ({ processQueue: jest.fn() }));
jest.mock('@/lib/mass-upload/dispatch', () => ({ dispatchProcessors: jest.fn() }));

import { GET } from '@/app/api/mass-upload/cron/route';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';

const mockProcessQueue = processQueue as jest.Mock;
const mockDispatch = dispatchProcessors as jest.Mock;

describe('CRON_SECRET security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockResolvedValue({ queued: 0, activeWorkers: 0, desiredWorkers: 0, spawned: 0 });
    mockProcessQueue.mockResolvedValue({
      workerId: 'w_test',
      claimed: 0,
      completed: 0,
      failed: 0,
      interrupted: 0,
      stalled: 0,
      leaseLost: 0,
      placesCreated: 0,
      reclaimed: { requeued: 0, stalled: 0 },
      remaining: 0,
      stoppedBecause: 'queue-empty',
      elapsedMs: 5,
    });
  });

  it('returns 401 without authorization header', async () => {
    process.env.CRON_SECRET = 'valid-secret';
    const req = new Request('http://localhost/api/mass-upload/cron');
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 with an incorrect secret', async () => {
    process.env.CRON_SECRET = 'valid-secret';
    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(401);
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: 'Bearer anything' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('Server configuration error');
  });

  it('accepts valid CRON_SECRET and returns 200', async () => {
    process.env.CRON_SECRET = 'valid-secret';
    process.env.GEMINI_VISION_ENABLED = 'true';

    const req = new Request('http://localhost/api/mass-upload/cron', {
      headers: { authorization: 'Bearer valid-secret' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
  });
});
