/**
 * @jest-environment node
 */

jest.mock('@/lib/db-queries', () => ({ getQueueStats: jest.fn() }));

import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { getQueueStats } from '@/lib/db-queries';
import { QUEUE_CONFIG } from '@/lib/mass-upload/queue-config';

const mockStats = getQueueStats as jest.Mock;
const ENV_SNAPSHOT = { ...process.env };

describe('dispatchProcessors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.MASS_UPLOAD_BASE_URL = 'https://example.test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
  });

  it('spawns nothing when the queue is empty', async () => {
    mockStats.mockResolvedValue({ queued: 0, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.spawned).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('spawns one worker for a small batch', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.desiredWorkers).toBe(1);
    expect(result.spawned).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('scales up for a 500-image drop but never past the worker cap', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.desiredWorkers).toBe(QUEUE_CONFIG.maxWorkers);
    expect(result.spawned).toBe(QUEUE_CONFIG.maxWorkers);
  });

  it('counts running workers so a repeated trigger does not stampede', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: QUEUE_CONFIG.maxWorkers, inFlight: 8 });

    const result = await dispatchProcessors('safety-net-cron', 'grow');

    expect(result.spawned).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('tops the pool back up when a worker has died', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: 1, inFlight: 4 });

    const result = await dispatchProcessors('safety-net-cron', 'grow');

    expect(result.spawned).toBe(QUEUE_CONFIG.maxWorkers - 1);
  });

  it('authenticates worker triggers with the cron secret', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('upload-start', 'grow');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://example.test/api/mass-upload/process');
    expect(init.headers.authorization).toBe('Bearer test-cron-secret');
  });

  it('degrades to the cron safety net when no base URL is configured', async () => {
    delete process.env.MASS_UPLOAD_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.spawned).toBe(0);
    expect(result.skippedReason).toMatch(/base url/);
  });

  it('bounds the trigger so a hanging worker cannot eat the caller run budget', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('upload-start', 'grow');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  it('drains the acknowledgement body instead of leaving the response open', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(0));
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 202, arrayBuffer });

    await dispatchProcessors('upload-start', 'grow');

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('treats a timed-out trigger like any other failed trigger', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });
    (global.fetch as jest.Mock).mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    );

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.spawned).toBe(0);
  });

  it('does not throw when a worker trigger fails', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connection refused'));

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.spawned).toBe(0);
  });

  // ── Keeping the pool flat across worker generations ───────────────────
  //
  // A chaining run hands its own slot on. It may not size a new pool from a
  // queue that looks uncovered only because its own leases were just released.

  it('never spawns more than one successor when a run chains', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('worker-chain', 'replace');

    expect(result.desiredWorkers).toBe(QUEUE_CONFIG.maxWorkers);
    expect(result.spawned).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps N simultaneous chain hops at N successors, not N x maxWorkers', async () => {
    // What every hop sees after releasing its leases: a deep queue and a pool
    // that looks empty. This is exactly the 3 -> 9 -> 27 generation blow-up.
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: 0, inFlight: 0 });

    const hops = await Promise.all(
      Array.from({ length: QUEUE_CONFIG.maxWorkers }, () =>
        dispatchProcessors('worker-chain', 'replace')
      )
    );

    expect(hops.every((hop) => hop.spawned <= 1)).toBe(true);
    expect(hops.reduce((total, hop) => total + hop.spawned, 0)).toBe(QUEUE_CONFIG.maxWorkers);
    expect(global.fetch).toHaveBeenCalledTimes(QUEUE_CONFIG.maxWorkers);
  });

  it('spawns nothing at all when the running workers already cover the depth', async () => {
    // Every claimable item is already held under a live lease.
    mockStats.mockResolvedValue({ queued: 4, activeWorkers: 1, inFlight: 6 });

    const chained = await dispatchProcessors('worker-chain', 'replace');
    const grown = await dispatchProcessors('safety-net-cron', 'grow');

    expect(chained.uncovered).toBe(0);
    expect(chained.spawned).toBe(0);
    expect(grown.spawned).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a growing dispatcher never exceeds the worker cap', async () => {
    mockStats.mockResolvedValue({ queued: 100_000, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start', 'grow');

    expect(result.spawned).toBe(QUEUE_CONFIG.maxWorkers);
    expect(global.fetch).toHaveBeenCalledTimes(QUEUE_CONFIG.maxWorkers);
  });

  // ── Every environment triggers its own functions ──────────────────────

  it('lets an explicit base URL override everything (the load-test harness)', async () => {
    process.env.MASS_UPLOAD_BASE_URL = 'http://127.0.0.1:3100';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'deployment.vercel.app';
    process.env.NEXT_PUBLIC_APP_URL = 'https://tabidreams.com';
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('upload-start', 'grow');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3100/api/mass-upload/process');
  });

  it('makes a preview deployment trigger itself, not the production domain', async () => {
    delete process.env.MASS_UPLOAD_BASE_URL;
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'td-git-branch.vercel.app';
    process.env.NEXT_PUBLIC_APP_URL = 'https://tabidreams.com';
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('upload-start', 'grow');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://td-git-branch.vercel.app/api/mass-upload/process');
  });

  it('still uses the configured app URL in production', async () => {
    delete process.env.MASS_UPLOAD_BASE_URL;
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'td-abc123.vercel.app';
    process.env.NEXT_PUBLIC_APP_URL = 'https://tabidreams.com';
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('safety-net-cron', 'grow');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://tabidreams.com/api/mass-upload/process');
  });
});
