/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import {
  createTikTokPageProvider,
  TIKTOK_DIAGNOSTIC_POSTS,
  TIKTOK_PAGE_READ_BUDGET_MS,
} from '@/lib/link-import/providers/tiktok-page';
import { checkRateLimit, getRateLimitRemaining } from '@/lib/rate-limit';
import { TIKTOK_CACHE_TTLS, type TikTokGuardrails } from '@/lib/link-import/tiktok-guardrails';
import { parseSocialLink } from '@/lib/link-import/url';
import type { LinkProviderResult } from '@/types/link-import';

// Every other test injects its own allowance checks; the limiter is replaced
// only so the provider's default checks can be driven without Upstash.
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getRateLimitRemaining: jest.fn(),
}));

const fixtures = path.join(process.cwd(), 'src/__tests__/fixtures/tiktok');
const html = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

function link(url = 'https://www.tiktok.com/@creator/video/7694185850497666335') {
  const parsed = parseSocialLink(url);
  if (!parsed.supported) throw new Error('Invalid test link');
  return parsed.link;
}

function guardrailStub(): TikTokGuardrails & {
  cache: Map<string, { details?: object; reason?: string }>;
  cacheWrites: jest.Mock;
  openBreaker: jest.Mock;
  clearBreaker: jest.Mock;
  reserveRequestSlot: jest.Mock;
  releaseRequestSlot: jest.Mock;
} {
  const cache = new Map<string, { details?: object; reason?: string }>();
  return {
    cache,
    getCache: jest.fn(async (id) => cache.get(id)),
    setCache: jest.fn(async (id, entry) => { cache.set(id, entry); }),
    cacheWrites: jest.fn(),
    isBreakerOpen: jest.fn(async () => false),
    openBreaker: jest.fn(async () => 15 * 60_000),
    clearBreaker: jest.fn(async () => undefined),
    reserveRequestSlot: jest.fn(async () => 'slot-1'),
    releaseRequestSlot: jest.fn(async () => undefined),
  } as unknown as TikTokGuardrails & {
    cache: Map<string, { details?: object; reason?: string }>;
    cacheWrites: jest.Mock;
    openBreaker: jest.Mock;
    clearBreaker: jest.Mock;
    reserveRequestSlot: jest.Mock;
    releaseRequestSlot: jest.Mock;
  };
}

function response(body: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  const bytes = new TextEncoder().encode(body);
  let read = false;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-length') return String(bytes.byteLength);
        return extraHeaders[name.toLowerCase()] ?? (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null);
      },
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true, value: undefined };
          read = true;
          return { done: false, value: bytes };
        },
        cancel: async () => undefined,
      }),
    },
  } as unknown as Response;
}

function setup(fetcher: typeof fetch, options: { enabled?: boolean; daily?: boolean } = {}) {
  const guardrails = guardrailStub();
  const sleep = jest.fn(async () => undefined);
  const hasDailyAllowance = jest.fn(async () => options.daily ?? true);
  const chargeDailyRequest = jest.fn(async () => options.daily ?? true);
  const provider = createTikTokPageProvider({
    enabled: () => options.enabled ?? true,
    getGuardrails: () => guardrails,
    hasDailyAllowance,
    chargeDailyRequest,
    fetcher,
    sleep,
    random: () => 0,
  });
  return { provider, guardrails, sleep, hasDailyAllowance, chargeDailyRequest };
}

describe('TikTok page provider', () => {
  it('maps a video post and caches only stable details', async () => {
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const { provider, guardrails } = setup(fetcher);
    const result = await provider.getDetails(link(), { userId: 'alice' });

    expect(result).toMatchObject({
      details: {
        caption: 'A quiet cafe in Lisbon #travel',
        hashtags: ['Lisbon', 'travel'],
        author: 'Cherry Pie Go',
        authorHandle: 'cherrypiego',
        placeName: 'Cafe Example',
        placeAddress: 'Rua Example 4',
        placeCategory: 'Cafe',
        placeCity: 'Lisbon',
        placeSourceId: 'poi-711',
        // `createTime` is 1790000000 seconds on the page; details carry epoch
        // milliseconds so postedAt and expiresAt share a unit.
        postedAt: 1_790_000_000_000,
        contentKind: 'video',
      },
      transient: { imageRefs: [{ expiresAt: 1_900_000_000_000 }] },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(link().canonicalUrl);
    expect(init.headers).toMatchObject({ 'user-agent': 'TravelDreamLinkPreview/1.0 (+https://tabidreams.com)' });
    expect(init.headers).not.toHaveProperty('cookie');
    expect(guardrails.setCache).toHaveBeenCalledWith(
      '7694185850497666335',
      { details: expect.objectContaining({ placeName: 'Cafe Example' }) },
      TIKTOK_CACHE_TTLS.positive,
    );
    expect(JSON.stringify(guardrails.cache.get('7694185850497666335'))).not.toContain('tiktokcdn');
    expect(JSON.stringify((result as LinkProviderResult).transient)).toContain('tiktokcdn');
  });

  it('reads photo posts through the video endpoint and returns fresh carousel refs', async () => {
    const photoLink = link('https://www.tiktok.com/@yourlisbongirl/photo/7634085795908881686');
    const fetcher = jest.fn(async () => response(html('photo-as-video-post.html')));
    const { provider } = setup(fetcher);
    const result = await provider.getDetails(photoLink, { userId: 'alice' });

    const firstCall = (fetcher.mock.calls as unknown as Array<[unknown, unknown]>)[0];
    expect(String(firstCall[0])).toBe('https://www.tiktok.com/@yourlisbongirl/video/7634085795908881686');
    expect(result).toMatchObject({
      details: { contentKind: 'photo', title: 'A photo walk', placeName: 'Miradouro Example', placeSourceId: '8451' },
      transient: { imageRefs: [{ width: 1080, height: 1440 }, { width: 1080, height: 1440 }] },
    });
    expect((result as { transient: { imageRefs: Array<{ expiresAt?: number }> } }).transient.imageRefs[0].expiresAt)
      .toBe(1_900_000_000_000);
  });

  it('negative-caches gone posts for 24 hours without retrying', async () => {
    const fetcher = jest.fn(async () => response(html('gone.html')));
    const { provider, guardrails } = setup(fetcher);
    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ empty: true, reason: 'gone' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(guardrails.setCache).toHaveBeenCalledWith(
      '7694185850497666335', { reason: 'gone' }, TIKTOK_CACHE_TTLS.gone,
    );
  });

  it('maps other TikTok status codes to unavailable and accepts partial payloads', async () => {
    const unavailable = setup(jest.fn(async () => response(html('unavailable.html'))));
    await expect(unavailable.provider.getDetails(link(), { userId: 'alice' }))
      .resolves.toMatchObject({ empty: true, reason: 'unavailable' });
    expect(unavailable.guardrails.setCache).toHaveBeenCalledWith(
      '7694185850497666335', { reason: 'unavailable' }, TIKTOK_CACHE_TTLS.transient,
    );

    const partialPayload = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' +
      '{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"statusCode":0,"itemInfo":{"itemStruct":{"id":"7694185850497666335"}}}}}</script>';
    const partial = setup(jest.fn(async () => response(partialPayload)));
    await expect(partial.provider.getDetails(link(), { userId: 'alice' }))
      .resolves.toMatchObject({ details: { contentKind: 'video' } });
  });

  it('opens the breaker for an empty shell and for HTTP 429', async () => {
    const empty = setup(jest.fn(async () => response(html('empty-shell.html'))));
    await expect(empty.provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'blocked' });
    expect(empty.guardrails.openBreaker).toHaveBeenCalledTimes(1);

    const tooMany = setup(jest.fn(async () => response(html('too-many-requests.html'), 429)));
    await expect(tooMany.provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'blocked' });
    expect(tooMany.guardrails.openBreaker).toHaveBeenCalledTimes(1);
  });

  it('stays off by default, and does not fetch if the explicit switch is off', async () => {
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const guardrails = guardrailStub();
    const provider = createTikTokPageProvider({ getGuardrails: () => guardrails, fetcher });
    const original = process.env.TIKTOK_PAGE_FETCH_ENABLED;
    delete process.env.TIKTOK_PAGE_FETCH_ENABLED;
    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ empty: true, reason: 'disabled' });
    await expect(setup(fetcher, { enabled: false }).provider.getDetails(link(), { userId: 'alice' }))
      .resolves.toMatchObject({ empty: true, reason: 'disabled' });
    expect(fetcher).not.toHaveBeenCalled();
    if (original === undefined) delete process.env.TIKTOK_PAGE_FETCH_ENABLED;
    else process.env.TIKTOK_PAGE_FETCH_ENABLED = original;
  });

  it('retries a network failure once and uses the shared request slot for each attempt', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('socket reset'))
      .mockResolvedValueOnce(response(html('video-post.html')));
    const { provider, guardrails, sleep } = setup(fetcher);
    await provider.getDetails(link(), { userId: 'alice' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(guardrails.reserveRequestSlot).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('charges the daily allowance once across a network or 5xx retry', async () => {
    const hasDailyAllowance = jest.fn(async () => true);
    const chargeDailyRequest = jest.fn(async () => true);
    const guardrails = guardrailStub();
    const sleep = jest.fn(async () => undefined);
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('socket reset'))
      .mockResolvedValueOnce(response(html('video-post.html')));
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance,
      chargeDailyRequest,
      fetcher,
      sleep,
      random: () => 0,
    });
    await provider.getDetails(link(), { userId: 'alice' });
    expect(hasDailyAllowance).toHaveBeenCalledTimes(1);
    expect(chargeDailyRequest).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(guardrails.reserveRequestSlot).toHaveBeenCalledTimes(2);
    expect(hasDailyAllowance.mock.invocationCallOrder[0]).toBeLessThan(
      guardrails.reserveRequestSlot.mock.invocationCallOrder[0],
    );
    expect(guardrails.reserveRequestSlot.mock.invocationCallOrder[0]).toBeLessThan(
      chargeDailyRequest.mock.invocationCallOrder[0],
    );
  });

  it('does not charge the daily allowance when the global slot is unavailable', async () => {
    const hasDailyAllowance = jest.fn(async () => true);
    const chargeDailyRequest = jest.fn(async () => true);
    const guardrails = guardrailStub();
    guardrails.reserveRequestSlot.mockResolvedValue(null);
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance,
      chargeDailyRequest,
      fetcher,
      sleep: jest.fn(async () => undefined),
      random: () => 0,
    });
    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      empty: true,
      reason: 'throttled',
    });
    expect(guardrails.reserveRequestSlot).toHaveBeenCalled();
    expect(hasDailyAllowance).toHaveBeenCalledTimes(1);
    expect(chargeDailyRequest).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('waits for the app-wide slot when the caller can afford to wait', async () => {
    const guardrails = guardrailStub();
    guardrails.reserveRequestSlot.mockResolvedValueOnce(null).mockResolvedValue('slot-2');
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const sleep = jest.fn(async () => undefined);
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance: async () => true,
      chargeDailyRequest: async () => true,
      fetcher,
      sleep,
      random: () => 0,
    });

    const result = await provider.getDetails(link(), { userId: 'alice', waitForSlot: true });

    expect(result).toMatchObject({ details: { placeName: 'Cafe Example' } });
    expect(guardrails.reserveRequestSlot).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the app-wide slot unless the caller asks to wait', async () => {
    const guardrails = guardrailStub();
    guardrails.reserveRequestSlot.mockResolvedValue(null);
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const sleep = jest.fn(async () => undefined);
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance: async () => true,
      chargeDailyRequest: async () => true,
      fetcher,
      sleep,
      random: () => 0,
    });

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      empty: true,
      reason: 'throttled',
    });
    expect(guardrails.reserveRequestSlot).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not reserve the global slot when the read-only daily check is exhausted', async () => {
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const { provider, guardrails, hasDailyAllowance, chargeDailyRequest } = setup(fetcher, { daily: false });

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      empty: true,
      reason: 'daily_limit',
    });
    expect(hasDailyAllowance).toHaveBeenCalledTimes(1);
    expect(guardrails.reserveRequestSlot).not.toHaveBeenCalled();
    expect(chargeDailyRequest).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('releases the reserved global slot if the daily charge loses a concurrent race', async () => {
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const guardrails = guardrailStub();
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance: jest.fn(async () => true),
      chargeDailyRequest: jest.fn(async () => false),
      fetcher,
      sleep: jest.fn(async () => undefined),
    });

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      empty: true,
      reason: 'daily_limit',
    });
    expect(guardrails.reserveRequestSlot).toHaveBeenCalledTimes(1);
    expect(guardrails.releaseRequestSlot).toHaveBeenCalledWith('slot-1');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('retries one 5xx and refuses redirects outside TikTok hosts', async () => {
    const retrying = setup(jest.fn()
      .mockResolvedValueOnce(response('', 503))
      .mockResolvedValueOnce(response(html('video-post.html'))));
    await retrying.provider.getDetails(link(), { userId: 'alice' });
    expect(retrying.guardrails.reserveRequestSlot).toHaveBeenCalledTimes(2);

    const redirectFetcher = jest.fn(async () => response('', 302, { location: 'https://example.com/page' }));
    const redirect = setup(redirectFetcher);
    await expect(redirect.provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      empty: true,
      reason: 'unavailable',
    });
    expect(redirectFetcher).toHaveBeenCalledTimes(1);
    expect((redirect.guardrails.reserveRequestSlot as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('does not exceed the page body cap or continue without the daily allowance', async () => {
    const large = setup(jest.fn(async () => response('x'.repeat(2 * 1024 * 1024 + 1))));
    await expect(large.provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'format_changed' });

    const dailyFetcher = jest.fn(async () => response(html('video-post.html')));
    const daily = setup(dailyFetcher, { daily: false });
    await expect(daily.provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'daily_limit' });
    expect(daily.guardrails.reserveRequestSlot).not.toHaveBeenCalled();
    expect(dailyFetcher).not.toHaveBeenCalled();
  });

  it('keeps a cached post when a forced re-read fails', async () => {
    const postId = '7694185850497666335';
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response(html('video-post.html')))
      .mockResolvedValueOnce(response('', 503))
      .mockResolvedValueOnce(response('', 503))
      .mockResolvedValueOnce(response(html('gone.html')))
      .mockResolvedValueOnce(response(html('unavailable.html')))
      .mockResolvedValueOnce(response('x'.repeat(2 * 1024 * 1024 + 1)));
    const { provider, guardrails } = setup(fetcher);

    await provider.getDetails(link(), { userId: 'alice' });
    expect(guardrails.cache.get(postId)).toMatchObject({ details: { placeName: 'Cafe Example' } });

    // Each failed re-read reports its own failure to the caller that forced it...
    const forced = { userId: 'alice', forceRefresh: true };
    await expect(provider.getDetails(link(), forced)).resolves.toMatchObject({ empty: true, reason: 'transient' });
    await expect(provider.getDetails(link(), forced)).resolves.toMatchObject({ empty: true, reason: 'gone' });
    await expect(provider.getDetails(link(), forced)).resolves.toMatchObject({ empty: true, reason: 'unavailable' });
    await expect(provider.getDetails(link(), forced)).resolves.toMatchObject({ empty: true, reason: 'format_changed' });
    expect(fetcher).toHaveBeenCalledTimes(6);

    // ...and none of them replaces what the post read as before.
    expect(guardrails.cache.get(postId)).toMatchObject({ details: { placeName: 'Cafe Example' } });
    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      details: { placeName: 'Cafe Example' },
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('reports a spent daily allowance apart from a busy app-wide slot', async () => {
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const spent = setup(fetcher, { daily: false });
    await expect(spent.provider.getDetails(link(), { userId: 'alice', waitForSlot: true })).resolves.toEqual({
      empty: true,
      reason: 'daily_limit',
    });

    const busy = setup(fetcher);
    busy.guardrails.reserveRequestSlot.mockResolvedValue(null);
    await expect(busy.provider.getDetails(link(), { userId: 'alice' })).resolves.toEqual({
      empty: true,
      reason: 'throttled',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports an allowance it could not read as unavailable, never as a spent day', async () => {
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const withDefaults = () => {
      const guardrails = guardrailStub();
      const provider = createTikTokPageProvider({
        enabled: () => true,
        getGuardrails: () => guardrails,
        fetcher,
        sleep: jest.fn(async () => undefined),
        random: () => 0,
      });
      return { provider, guardrails };
    };
    const limited = { success: false, limit: 30, remaining: 0, reset: 0 };
    const limiterDown = { success: true, limit: 0, remaining: 0, reset: 0 };

    // The read-only peek could not reach the limiter.
    (getRateLimitRemaining as jest.Mock).mockResolvedValue(null);
    const peekDown = withDefaults();
    await expect(peekDown.provider.getDetails(link(), { userId: 'alice' })).resolves.toEqual({
      empty: true,
      reason: 'safety_unavailable',
    });
    expect(peekDown.guardrails.reserveRequestSlot).not.toHaveBeenCalled();

    // The peek answered, then the charge could not reach the limiter.
    (getRateLimitRemaining as jest.Mock).mockResolvedValue(5);
    (checkRateLimit as jest.Mock).mockResolvedValue(limiterDown);
    const chargeDown = withDefaults();
    await expect(chargeDown.provider.getDetails(link(), { userId: 'alice' })).resolves.toEqual({
      empty: true,
      reason: 'safety_unavailable',
    });
    expect(chargeDown.guardrails.releaseRequestSlot).toHaveBeenCalledWith('slot-1');

    // An allowance that was read and is spent stays its own reason.
    (getRateLimitRemaining as jest.Mock).mockResolvedValue(0);
    await expect(withDefaults().provider.getDetails(link(), { userId: 'alice' })).resolves.toEqual({
      empty: true,
      reason: 'daily_limit',
    });
    (getRateLimitRemaining as jest.Mock).mockResolvedValue(1);
    (checkRateLimit as jest.Mock).mockResolvedValue(limited);
    await expect(withDefaults().provider.getDetails(link(), { userId: 'alice' })).resolves.toEqual({
      empty: true,
      reason: 'daily_limit',
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('gives up inside its budget when redirects keep waiting for the app-wide slot', async () => {
    let clock = 1_000_000;
    const guardrails = guardrailStub();
    // The first hop gets the slot at once; every later reservation is busy for
    // 9.5 s before it succeeds, which is the wait each redirect hop sits out.
    let reservations = 0;
    guardrails.reserveRequestSlot.mockImplementation(async () => {
      reservations += 1;
      if (reservations === 1) return 'slot-1';
      return (reservations - 1) % 20 === 0 ? `slot-${reservations}` : null;
    });
    const fetcher = jest.fn(async () => {
      clock += 6_000;
      return response('', 302, { location: 'https://www.tiktok.com/@creator/video/7694185850497666335?again=1' });
    });
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance: async () => true,
      chargeDailyRequest: async () => true,
      fetcher,
      sleep: jest.fn(async (ms: number) => { clock += ms; }),
      random: () => 0,
      now: () => clock,
    });

    const started = clock;
    const result = await provider.getDetails(link(), { userId: 'alice' }) as LinkProviderResult;

    // Unbounded, this read runs four hops and about 52 s; the save route is
    // killed at 60 s with short-link resolution and oEmbed on top of it.
    expect(clock - started).toBeLessThanOrEqual(TIKTOK_PAGE_READ_BUDGET_MS.default);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ empty: true, reason: 'throttled' });
    expect(guardrails.cache.size).toBe(0);
  });

  it('does not start a retry it has no time left for', async () => {
    let clock = 1_000_000;
    const guardrails = guardrailStub();
    const fetcher = jest.fn(async () => {
      clock += TIKTOK_PAGE_READ_BUDGET_MS.default - 1_500;
      return response('', 503);
    });
    const sleep = jest.fn(async (ms: number) => { clock += ms; });
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      hasDailyAllowance: async () => true,
      chargeDailyRequest: async () => true,
      fetcher,
      sleep,
      random: () => 0,
      now: () => clock,
    });

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toEqual({
      empty: true,
      reason: 'transient',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    // Running out of time says nothing about the post, so nothing is cached.
    expect(guardrails.cache.size).toBe(0);
  });

  it('keeps the diagnostic list fixed and bounded', () => {
    expect(TIKTOK_DIAGNOSTIC_POSTS.length).toBeLessThanOrEqual(10);
    expect(TIKTOK_DIAGNOSTIC_POSTS.every((post) => post.startsWith('https://www.tiktok.com/@'))).toBe(true);
  });

  it('reads a post whose caption mentions a block instead of opening the breaker', async () => {
    const body = html('video-post.html').replace(
      'A quiet cafe in Lisbon #travel',
      'Access denied: the custard tarts are gone',
    );
    const fetcher = jest.fn(async () => response(body));
    const { provider, guardrails } = setup(fetcher);

    const result = await provider.getDetails(link(), { userId: 'alice' });

    expect(result).toMatchObject({ details: { caption: 'Access denied: the custard tarts are gone' } });
    expect(guardrails.openBreaker).not.toHaveBeenCalled();
    expect(guardrails.setCache).toHaveBeenCalledWith(
      '7694185850497666335',
      { details: expect.objectContaining({ caption: 'Access denied: the custard tarts are gone' }) },
      TIKTOK_CACHE_TTLS.positive,
    );
  });

  it('never offers a video cover as a photo carousel image', async () => {
    const photoLink = link('https://www.tiktok.com/@yourlisbongirl/photo/7634085795908881686');
    const fetcher = jest.fn(async () => response(html('photo-without-carousel.html')));
    const { provider } = setup(fetcher);

    const result = await provider.getDetails(photoLink, { userId: 'alice' });

    expect(result).toMatchObject({ details: { contentKind: 'photo' } });
    expect((result as LinkProviderResult).transient?.imageRefs).toEqual([]);
  });

  it('opens the breaker for a captcha wall that shows an unusable payload', async () => {
    const body = '<html><body><h1>Verify to continue</h1>'
      + '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":"broken"}</script>'
      + '</body></html>';
    const { provider, guardrails } = setup(jest.fn(async () => response(body)));

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'blocked' });
    expect(guardrails.openBreaker).toHaveBeenCalledTimes(1);
  });

  it('treats an unusable payload without a wall as a format change', async () => {
    const body = '<html><body><h1>A quiet cafe in Lisbon</h1>'
      + '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":"broken"}</script>'
      + '</body></html>';
    const { provider, guardrails } = setup(jest.fn(async () => response(body)));

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'format_changed' });
    expect(guardrails.openBreaker).not.toHaveBeenCalled();
  });

  it('treats a payload without the video-detail scope as a format change', async () => {
    const body = '<html><body><h1>A quiet cafe in Lisbon</h1>'
      + '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
      + '{"__DEFAULT_SCOPE__":{"webapp.video-detail-renamed":{"statusCode":0}}}</script>'
      + '</body></html>';
    const { provider, guardrails } = setup(jest.fn(async () => response(body)));

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'format_changed' });
    expect(guardrails.openBreaker).not.toHaveBeenCalled();
  });

  it('opens the breaker for a payload without the video-detail scope behind a wall', async () => {
    const body = '<html><body><h1>Verify to continue</h1>'
      + '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
      + '{"__DEFAULT_SCOPE__":{"webapp.video-detail-renamed":{"statusCode":0}}}</script>'
      + '</body></html>';
    const { provider, guardrails } = setup(jest.fn(async () => response(body)));

    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'blocked' });
    expect(guardrails.openBreaker).toHaveBeenCalledTimes(1);
  });

  it('logs an unexpected failure instead of reporting it as a plain outage', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const guardrails = guardrailStub();
      (guardrails.getCache as jest.Mock).mockRejectedValue(new Error('redis unavailable'));
      const provider = createTikTokPageProvider({
        enabled: () => true,
        getGuardrails: () => guardrails,
        hasDailyAllowance: async () => true,
        chargeDailyRequest: async () => true,
        fetcher: jest.fn(async () => response(html('video-post.html'))),
        sleep: async () => undefined,
      });

      await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
        empty: true,
        reason: 'safety_unavailable',
      });

      const logged = warn.mock.calls
        .map((call) => call.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '))
        .join('\n');
      expect(logged).toContain('redis unavailable');
    } finally {
      warn.mockRestore();
    }
  });
});
