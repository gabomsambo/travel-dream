/**
 * @jest-environment node
 */

jest.mock('@/lib/mass-upload/queue-processor', () => ({ processQueue: jest.fn() }));
jest.mock('@/lib/mass-upload/dispatch', () => ({ dispatchProcessors: jest.fn() }));
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (fn: () => unknown) => afterCallbacks.push(fn) };
});

const afterCallbacks: Array<() => unknown> = [];

import { POST } from '@/app/api/mass-upload/process/route';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';

const mockProcessQueue = processQueue as jest.Mock;
const mockDispatch = dispatchProcessors as jest.Mock;
const CRON_SECRET = 'test-cron-secret';

function request(body: unknown = {}, secret: string | null = CRON_SECRET) {
  return new Request('http://localhost/api/mass-upload/process', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/mass-upload/process', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    afterCallbacks.length = 0;
    process.env.CRON_SECRET = CRON_SECRET;
    mockProcessQueue.mockResolvedValue({ completed: 3, failed: 0, remaining: 0, placesCreated: 9 });
    mockDispatch.mockResolvedValue({ queued: 0, activeWorkers: 0, desiredWorkers: 0, spawned: 0 });
  });

  it('is server-to-server only: no secret, no work', async () => {
    const res = await POST(request({}, null));
    expect(res.status).toBe(401);
    expect(mockProcessQueue).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it('rejects a wrong secret', async () => {
    const res = await POST(request({}, 'nope'));
    expect(res.status).toBe(401);
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });

  it('answers 202 immediately and drains the queue afterwards', async () => {
    const res = await POST(request({ reason: 'upload-start#0' }));

    expect(res.status).toBe(202);
    expect(mockProcessQueue).not.toHaveBeenCalled(); // not before responding
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
  });

  it('runs inline and returns the result when asked to wait', async () => {
    const res = await POST(request({ wait: true }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.completed).toBe(3);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('hands the baton on when work is still queued at the end of a run', async () => {
    mockProcessQueue.mockResolvedValue({ completed: 20, failed: 0, remaining: 480, placesCreated: 60 });

    await POST(request({ wait: true }));

    expect(mockDispatch).toHaveBeenCalledWith('worker-chain');
  });

  it('does not chain when the queue is drained', async () => {
    await POST(request({ wait: true }));
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('survives a run that throws in the background', async () => {
    mockProcessQueue.mockRejectedValue(new Error('boom'));

    const res = await POST(request({}));
    expect(res.status).toBe(202);
    await expect(afterCallbacks[0]()).resolves.not.toThrow();
  });
});
