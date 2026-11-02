/** @jest-environment node */
import { parseSocialLink } from '@/lib/link-import/url';
import { resolveTikTokShortLink } from '@/lib/link-import/resolve-short-link';

describe('parseSocialLink', () => {
  it.each([
    ['https://www.tiktok.com/t/ZPLaXhYUP/', 'tiktok-short'],
    ['https://www.tiktok.com/t/ZPLauy1uQ/', 'tiktok-short'],
    ['https://www.tiktok.com/@yourlisbongirl/photo/7634085795908881686?_r=1&_t=ZG-9B4YSV3Tm40', 'tiktok-photo'],
    ['https://www.tiktok.com/@cherrypiego/video/7694185850497666335?_r=1&_t=ZG-9B4V6FoFnAe', 'tiktok-video'],
    ['https://www.tiktok.com/t/ZP9ypcSbqemMt-CSPsh/?poisharing=Ajuda', 'tiktok-short'],
    ['https://www.tiktok.com/place/Ajuda-22535796488759037?_r=1&_svg=3', 'tiktok-place'],
    ['https://vm.tiktok.com/ZMxyz1234/', 'tiktok-short'],
    ['https://vt.tiktok.com/ZMxyz1234/', 'tiktok-short'],
    ['https://www.instagram.com/p/C8abcDEFghi/?igsh=abc&utm_source=share', 'instagram-post'],
    ['https://www.instagram.com/reel/C8abcDEFghi/?igsh=abc', 'instagram-reel'],
  ])('classifies %s as %s', (url, kind) => {
    const result = parseSocialLink(url);
    expect(result.supported).toBe(true);
    if (result.supported) expect(result.link.kind).toBe(kind);
  });

  it('canonicalizes TikTok post links and strips tracking parameters', () => {
    const result = parseSocialLink(
      'https://www.tiktok.com/@yourlisbongirl/photo/7634085795908881686?_r=1&_t=token&utm_campaign=spring'
    );
    expect(result).toMatchObject({
      supported: true,
      link: {
        platform: 'tiktok',
        kind: 'tiktok-photo',
        handle: 'yourlisbongirl',
        postId: '7634085795908881686',
        canonicalUrl: 'https://www.tiktok.com/@yourlisbongirl/photo/7634085795908881686',
      },
    });
  });

  it('extracts a place name and id from a TikTok place slug', () => {
    const result = parseSocialLink('https://www.tiktok.com/place/Ajuda-22535796488759037?_r=1&_svg=3');
    expect(result).toMatchObject({
      supported: true,
      link: {
        kind: 'tiktok-place',
        placeName: 'Ajuda',
        placeId: '22535796488759037',
        canonicalUrl: 'https://www.tiktok.com/place/Ajuda-22535796488759037',
      },
    });
  });

  it('keeps the place name carried by a TikTok short link', () => {
    const result = parseSocialLink('https://www.tiktok.com/t/ZP9ypcSbqemMt-CSPsh/?poisharing=Ajuda&_r=1');
    expect(result).toMatchObject({
      supported: true,
      link: {
        kind: 'tiktok-short',
        placeName: 'Ajuda',
        needsResolution: true,
        canonicalUrl: 'https://www.tiktok.com/t/ZP9ypcSbqemMt-CSPsh/?poisharing=Ajuda',
      },
    });
  });

  it.each([
    'https://tiktok.com.evil.test/@user/video/123456789',
    'https://instagram.com.evil.test/p/C8abcDEFghi/',
    'javascript:alert(1)',
    'https://www.tiktok.com/@user/video/not-an-id',
    'https://www.tiktok.com/place/Ajuda/',
  ])('rejects unsupported or malformed links: %s', (url) => {
    expect(parseSocialLink(url).supported).toBe(false);
  });
});

describe('resolveTikTokShortLink', () => {
  const parsed = parseSocialLink('https://www.tiktok.com/t/ZPLaXhYUP/');
  if (!parsed.supported) throw new Error('short-link fixture did not parse');

  it('follows manual redirects and classifies the canonical destination', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://www.tiktok.com/@creator/video/7694185850497666335' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await resolveTikTokShortLink(parsed.link, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    expect(result).toMatchObject({
      resolution: { status: 'resolved' },
      link: {
        kind: 'tiktok-video',
        postId: '7694185850497666335',
        originalUrl: 'https://www.tiktok.com/t/ZPLaXhYUP/',
      },
    });
  });

  it('does not follow a redirect outside TikTok and preserves the original link', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://attacker.example/redirect' } })
    );
    const result = await resolveTikTokShortLink(parsed.link, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      resolution: { status: 'unresolved', error: 'invalid-redirect' },
      link: { kind: 'tiktok-short', canonicalUrl: 'https://www.tiktok.com/t/ZPLaXhYUP/' },
    });
  });

  it('returns unresolved on fetch failure', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('network unavailable'));
    await expect(resolveTikTokShortLink(parsed.link, fetcher)).resolves.toMatchObject({
      resolution: { status: 'unresolved', error: 'fetch-failed' },
    });
  });

  it('stops after the redirect hop cap', async () => {
    const fetcher = jest.fn().mockImplementation(async (input: URL | string) => {
      const code = new URL(String(input)).pathname.split('/').filter(Boolean).at(-1);
      return new Response(null, { status: 302, headers: { location: `/t/${code}x` } });
    });
    const result = await resolveTikTokShortLink(parsed.link, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(result.resolution).toMatchObject({ status: 'unresolved', error: 'hop-limit' });
  });
});
