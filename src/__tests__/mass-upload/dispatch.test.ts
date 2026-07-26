/**
 * @jest-environment node
 */

jest.mock('@/lib/db-queries', () => ({ getQueueStats: jest.fn() }));

import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { getQueueStats } from '@/lib/db-queries';
import { QUEUE_CONFIG } from '@/lib/mass-upload/queue-config';

const mockStats = getQueueStats as jest.Mock;

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

  it('spawns nothing when the queue is empty', async () => {
    mockStats.mockResolvedValue({ queued: 0, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start');

    expect(result.spawned).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('spawns one worker for a small batch', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start');

    expect(result.desiredWorkers).toBe(1);
    expect(result.spawned).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('scales up for a 500-image drop but never past the worker cap', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start');

    expect(result.desiredWorkers).toBe(QUEUE_CONFIG.maxWorkers);
    expect(result.spawned).toBe(QUEUE_CONFIG.maxWorkers);
  });

  it('counts running workers so a repeated trigger does not stampede', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: QUEUE_CONFIG.maxWorkers, inFlight: 8 });

    const result = await dispatchProcessors('safety-net-cron');

    expect(result.spawned).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('tops the pool back up when a worker has died', async () => {
    mockStats.mockResolvedValue({ queued: 500, activeWorkers: 1, inFlight: 4 });

    const result = await dispatchProcessors('safety-net-cron');

    expect(result.spawned).toBe(QUEUE_CONFIG.maxWorkers - 1);
  });

  it('authenticates worker triggers with the cron secret', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('upload-start');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://example.test/api/mass-upload/process');
    expect(init.headers.authorization).toBe('Bearer test-cron-secret');
  });

  it('degrades to the cron safety net when no base URL is configured', async () => {
    delete process.env.MASS_UPLOAD_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_URL;
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    const result = await dispatchProcessors('upload-start');

    expect(result.spawned).toBe(0);
    expect(result.skippedReason).toMatch(/base url/);
  });

  it('bounds the trigger so a hanging worker cannot eat the caller run budget', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });

    await dispatchProcessors('upload-start');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  it('drains the acknowledgement body instead of leaving the response open', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(0));
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 202, arrayBuffer });

    await dispatchProcessors('upload-start');

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('treats a timed-out trigger like any other failed trigger', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });
    (global.fetch as jest.Mock).mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    );

    const result = await dispatchProcessors('upload-start');

    expect(result.spawned).toBe(0);
  });

  it('does not throw when a worker trigger fails', async () => {
    mockStats.mockResolvedValue({ queued: 5, activeWorkers: 0, inFlight: 0 });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connection refused'));

    const result = await dispatchProcessors('upload-start');

    expect(result.spawned).toBe(0);
  });
});
