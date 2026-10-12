/**
 * @jest-environment jsdom
 *
 * Regression: two overlapping heart saves on the same place must not report the
 * first click as saved when a later attempt settles — especially when the first
 * failed and a later one succeeded (failedClick used to be cleared on success).
 */
import { act, waitFor } from '@testing-library/react';
import { resetHeartWriterForTests, writeHearts } from '@/lib/explore/dreams';

function heldResponse() {
  let release!: (body: unknown, status?: number) => void;
  const gate = new Promise<Response>((resolve) => {
    release = (body, status = 200) =>
      resolve({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response);
  });
  return { gate, release };
}

describe('writeHearts overlapping failures', () => {
  beforeEach(() => {
    resetHeartWriterForTests();
    jest.restoreAllMocks();
  });

  it('reports false for an earlier failed click when a later one succeeds', async () => {
    const first = heldResponse();
    const second = heldResponse();
    let posts = 0;
    global.fetch = jest.fn((_url, init) => {
      posts += 1;
      if (posts === 1) return first.gate;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      return second.gate.then(() => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          placeIds: (body as { placeIds: string[] } | null)?.placeIds ?? ['plc_a'],
        }),
      })) as Promise<Response>;
    });

    const p1 = writeHearts(['plc_a'], true);
    await waitFor(() => expect(posts).toBe(1));
    const p2 = writeHearts(['plc_a'], true);
    await act(async () => {
      first.release({ status: 'error' }, 503);
    });
    await waitFor(() => expect(posts).toBe(2));
    await act(async () => {
      second.release({ status: 'success', placeIds: ['plc_a'] });
    });

    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(true);
  });
});
