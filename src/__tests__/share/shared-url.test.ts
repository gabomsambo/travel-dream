import { extractSharedUrl, inboxLinkHref, parseShareNotice } from '@/lib/link-import/shared-url';
import { safeCallbackPath } from '@/lib/safe-callback';

describe('extractSharedUrl', () => {
  it('reads the url field when it is filled', () => {
    expect(extractSharedUrl({ url: 'https://www.tiktok.com/@a/video/123' })).toBe('https://www.tiktok.com/@a/video/123');
  });

  it('finds the link Android puts inside text, with a caption around it', () => {
    expect(extractSharedUrl({
      url: '',
      title: 'TikTok',
      text: "Check out creator's video! #TikTok https://vt.tiktok.com/ZSabc123/",
    })).toBe('https://vt.tiktok.com/ZSabc123/');
  });

  it('falls back to the title', () => {
    expect(extractSharedUrl({ title: 'see https://www.instagram.com/reel/C8abc/' })).toBe('https://www.instagram.com/reel/C8abc/');
  });

  it('prefers a TikTok or Instagram URL over an earlier unrelated one', () => {
    expect(extractSharedUrl({ text: 'via https://example.com/x then https://www.instagram.com/p/C8abc/' }))
      .toBe('https://www.instagram.com/p/C8abc/');
  });

  it('returns the first URL of any kind when none is supported, so the caller can say so', () => {
    expect(extractSharedUrl({ text: 'https://example.com/a and https://example.org/b' })).toBe('https://example.com/a');
  });

  it('trims sentence punctuation and an unbalanced closing bracket', () => {
    expect(extractSharedUrl({ text: 'Look (https://www.instagram.com/p/C8abc/).' })).toBe('https://www.instagram.com/p/C8abc/');
    expect(extractSharedUrl({ text: 'Wow https://www.tiktok.com/@a/video/123!' })).toBe('https://www.tiktok.com/@a/video/123');
  });

  it('ignores non-http schemes and returns null when there is no link', () => {
    expect(extractSharedUrl({ text: 'javascript:alert(1) ftp://x.test/a' })).toBeNull();
    expect(extractSharedUrl({})).toBeNull();
    expect(extractSharedUrl({ url: null, text: null, title: null })).toBeNull();
  });
});

describe('inboxLinkHref', () => {
  it('points at the saved link card in the Inbox', () => {
    expect(inboxLinkHref('src_1')).toBe('/inbox?link=src_1#link-src_1');
    expect(inboxLinkHref('src_1', 'duplicate')).toBe('/inbox?link=src_1&shared=duplicate#link-src_1');
  });
});

describe('parseShareNotice', () => {
  it('accepts only known notices', () => {
    expect(parseShareNotice('saved')).toBe('saved');
    expect(parseShareNotice('busy')).toBe('busy');
    expect(parseShareNotice('<script>')).toBeUndefined();
    expect(parseShareNotice(undefined)).toBeUndefined();
  });
});

describe('safeCallbackPath', () => {
  it('keeps a same-site path with its query', () => {
    expect(safeCallbackPath('/share-target?text=hi%20https%3A%2F%2Fx')).toBe('/share-target?text=hi%20https%3A%2F%2Fx');
  });

  it.each(['https://evil.test/', '//evil.test/', '/\\evil.test', 'javascript:alert(1)', 'inbox', '/in\nbox', '', null])(
    'falls back to the Inbox for %p',
    (value) => {
      expect(safeCallbackPath(value)).toBe('/inbox');
    },
  );
});
