/** @jest-environment node */
import { enrichLinkDetails, mergeLinkDetails, type LinkDetailsProvider } from '@/lib/link-import/details';
import { createTikTokOEmbedProvider } from '@/lib/link-import/providers/tiktok-oembed';
import { parseSocialLink } from '@/lib/link-import/url';

function linkFor(url: string) {
  const result = parseSocialLink(url);
  if (!result.supported) throw new Error(`Invalid test link: ${url}`);
  return result.link;
}

describe('link detail providers', () => {
  it('merges provider details in order without erasing existing values', () => {
    expect(mergeLinkDetails([
      { provider: 'url', status: 'ok', details: { author: '@traveler', placeName: 'Ajuda' }, fetchedAt: 'now' },
      { provider: 'oembed', status: 'ok', details: { author: 'Traveler Name', title: 'Lisbon tips' }, fetchedAt: 'now' },
    ])).toEqual({ author: '@traveler', placeName: 'Ajuda', title: 'Lisbon tips' });
  });

  it('runs supported providers in order and records provider attribution', async () => {
    const calls: string[] = [];
    const providers: LinkDetailsProvider[] = [
      { name: 'first', supports: () => true, getDetails: async () => { calls.push('first'); return { placeName: 'Ajuda' }; } },
      { name: 'second', supports: () => true, getDetails: async () => { calls.push('second'); return { title: 'Lisbon' }; } },
    ];

    const result = await enrichLinkDetails(linkFor('https://www.tiktok.com/t/ZPLaXhYUP/'), providers);
    expect(calls).toEqual(['first', 'second']);
    expect(result.details).toEqual({ placeName: 'Ajuda', title: 'Lisbon' });
    expect(result.providers.map((provider) => provider.provider)).toEqual(['first', 'second']);
  });

  it('calls TikTok oEmbed only for video links and caches its safe response fields', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      version: '1.0',
      type: 'video',
      title: 'Lisbon hidden spots',
      author_name: 'Creator',
      thumbnail_url: 'https://p16-sign.tiktokcdn.com/thumb.jpg',
      html: '<iframe>not persisted</iframe>',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = createTikTokOEmbedProvider(fetcher);

    const result = await provider.getDetails(linkFor('https://www.tiktok.com/@creator/video/7694185850497666335'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('/oembed?url=');
    expect(result).toMatchObject({
      details: { author: 'Creator', title: 'Lisbon hidden spots', thumbnailReference: 'https://p16-sign.tiktokcdn.com/thumb.jpg' },
      cachedResponse: { version: '1.0', type: 'video', author_name: 'Creator' },
    });
    expect(JSON.stringify(result)).not.toContain('<iframe>');

    expect(provider.supports(linkFor('https://www.tiktok.com/@creator/photo/7634085795908881686'))).toBe(false);
    expect(provider.supports(linkFor('https://www.instagram.com/p/C8abcDEFghi/'))).toBe(false);
  });

  it('treats TikTok oEmbed HTTP 400 as no data', async () => {
    const provider = createTikTokOEmbedProvider(jest.fn().mockResolvedValue(new Response(null, { status: 400 })));
    await expect(provider.getDetails(linkFor('https://www.tiktok.com/@creator/video/7694185850497666335')))
      .resolves.toEqual({ empty: true });
  });

  it('records provider outages without failing the whole enrichment', async () => {
    const result = await enrichLinkDetails(linkFor('https://www.tiktok.com/@creator/video/7694185850497666335'), [
      { name: 'offline', supports: () => true, getDetails: async () => { throw new Error('offline'); } },
    ]);
    expect(result.details).toEqual({});
    expect(result.providers).toMatchObject([{ provider: 'offline', status: 'error', error: 'provider-unavailable' }]);
  });
});
