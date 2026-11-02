/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import { createTikTokPageProvider, TIKTOK_DIAGNOSTIC_POSTS } from '@/lib/link-import/providers/tiktok-page';
import { TIKTOK_CACHE_TTLS, type TikTokGuardrails } from '@/lib/link-import/tiktok-guardrails';
import { parseSocialLink } from '@/lib/link-import/url';
import type { LinkProviderResult } from '@/types/link-import';

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
    reserveRequestSlot: jest.fn(async () => true),
  } as unknown as TikTokGuardrails & {
    cache: Map<string, { details?: object; reason?: string }>;
    cacheWrites: jest.Mock;
    openBreaker: jest.Mock;
    clearBreaker: jest.Mock;
    reserveRequestSlot: jest.Mock;
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
  const provider = createTikTokPageProvider({
    enabled: () => options.enabled ?? true,
    getGuardrails: () => guardrails,
    allowDailyRequest: jest.fn(async () => options.daily ?? true),
    fetcher,
    sleep,
    random: () => 0,
  });
  return { provider, guardrails, sleep };
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
    const allowDailyRequest = jest.fn(async () => true);
    const guardrails = guardrailStub();
    const sleep = jest.fn(async () => undefined);
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('socket reset'))
      .mockResolvedValueOnce(response(html('video-post.html')));
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      allowDailyRequest,
      fetcher,
      sleep,
      random: () => 0,
    });
    await provider.getDetails(link(), { userId: 'alice' });
    expect(allowDailyRequest).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(guardrails.reserveRequestSlot).toHaveBeenCalledTimes(2);
  });

  it('does not charge the daily allowance when the global slot is unavailable', async () => {
    const allowDailyRequest = jest.fn(async () => true);
    const guardrails = guardrailStub();
    guardrails.reserveRequestSlot.mockResolvedValue(false);
    const fetcher = jest.fn(async () => response(html('video-post.html')));
    const provider = createTikTokPageProvider({
      enabled: () => true,
      getGuardrails: () => guardrails,
      allowDailyRequest,
      fetcher,
      sleep: jest.fn(async () => undefined),
      random: () => 0,
    });
    await expect(provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({
      empty: true,
      reason: 'throttled',
    });
    expect(guardrails.reserveRequestSlot).toHaveBeenCalled();
    expect(allowDailyRequest).not.toHaveBeenCalled();
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
    await expect(daily.provider.getDetails(link(), { userId: 'alice' })).resolves.toMatchObject({ reason: 'throttled' });
    expect(daily.guardrails.reserveRequestSlot).toHaveBeenCalled();
    expect(dailyFetcher).not.toHaveBeenCalled();
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
});
