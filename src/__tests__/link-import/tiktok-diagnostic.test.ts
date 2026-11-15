/** @jest-environment node */
jest.mock('next/server', () => ({ NextRequest: global.Request, NextResponse: global.Response }));
jest.mock('@/lib/link-import/tiktok-guardrails', () => ({ getTikTokGuardrails: jest.fn() }));
jest.mock('@/lib/link-import/providers/tiktok-page', () => ({
  TIKTOK_DIAGNOSTIC_POSTS: [
    'https://www.tiktok.com/@creator/video/7694185850497666335',
    'https://www.tiktok.com/@creator/video/7634085795908881686',
  ],
  inspectTikTokPage: jest.fn().mockResolvedValue({ status: 200, shell: false, rateLimited: false }),
}));

import { NextRequest } from 'next/server';
import { getTikTokGuardrails } from '@/lib/link-import/tiktok-guardrails';
import { inspectTikTokPage, TIKTOK_DIAGNOSTIC_POSTS } from '@/lib/link-import/providers/tiktok-page';
import { GET } from '@/app/api/tiktok/diagnostic/route';

describe('GET /api/tiktok/diagnostic', () => {
  const oldSecret = process.env.CRON_SECRET;
  const oldSwitch = process.env.TIKTOK_PAGE_FETCH_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.CRON_SECRET = 'diagnostic-secret';
    process.env.TIKTOK_PAGE_FETCH_ENABLED = 'false';
    (getTikTokGuardrails as jest.Mock).mockReturnValue({ reserveRequestSlot: jest.fn().mockResolvedValue(true) });
    (inspectTikTokPage as jest.Mock).mockResolvedValue({ status: 200, shell: false, rateLimited: false });
  });

  afterAll(() => {
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
    if (oldSwitch === undefined) delete process.env.TIKTOK_PAGE_FETCH_ENABLED;
    else process.env.TIKTOK_PAGE_FETCH_ENABLED = oldSwitch;
    jest.useRealTimers();
  });

  it('requires the cron secret and stays independent of the reader kill switch', async () => {
    const unauthorized = await GET(new NextRequest('https://tabidreams.com/api/tiktok/diagnostic') as never);
    expect(unauthorized.status).toBe(401);
    expect(inspectTikTokPage).not.toHaveBeenCalled();

    jest.useFakeTimers();
    const probeTimes: number[] = [];
    (inspectTikTokPage as jest.Mock).mockImplementation(async () => {
      probeTimes.push(Date.now());
      return { status: 200, shell: false, rateLimited: false };
    });
    const authorized = GET(new NextRequest('https://tabidreams.com/api/tiktok/diagnostic', {
      headers: { authorization: 'Bearer diagnostic-secret' },
    }) as never);
    await jest.advanceTimersByTimeAsync(100_000);
    const response = await authorized;
    expect(response.status).toBe(200);
    const body = await response.json() as { count: number; probes: Array<{ url: string; status: number; shell: boolean; rateLimited: boolean }> };
    expect(body.count).toBe(10);
    expect(body.probes).toHaveLength(10);
    expect(body.probes.map((probe) => probe.url)).toEqual(
      Array.from({ length: 10 }, (_, index) => TIKTOK_DIAGNOSTIC_POSTS[index % TIKTOK_DIAGNOSTIC_POSTS.length]),
    );
    expect(body.probes.every((probe) => probe.status === 200 && !probe.shell && !probe.rateLimited)).toBe(true);
    expect(inspectTikTokPage).toHaveBeenCalledTimes(10);
    expect(probeTimes).toHaveLength(10);
    for (let index = 1; index < probeTimes.length; index += 1) {
      expect(probeTimes[index] - probeTimes[index - 1]).toBeGreaterThanOrEqual(10_000);
    }
    jest.useRealTimers();
  });

  it('refuses to probe unless the app-wide Upstash request slot is available', async () => {
    (getTikTokGuardrails as jest.Mock).mockReturnValue({ reserveRequestSlot: jest.fn().mockResolvedValue(false) });
    jest.useFakeTimers();
    const result = GET(new NextRequest('https://tabidreams.com/api/tiktok/diagnostic', {
      headers: { authorization: 'Bearer diagnostic-secret' },
    }) as never);
    await jest.advanceTimersByTimeAsync(60_000);
    const response = await result;
    expect(response.status).toBe(503);
    expect(inspectTikTokPage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
