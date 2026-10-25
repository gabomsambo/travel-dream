import { photoRoute, photoTint, resolverSrc, resolverSrcSet } from '@/lib/photo-url';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require('../../../next.config.js') as {
  images: { remotePatterns: Array<{ protocol: string; hostname: string }> };
};

describe('photoRoute', () => {
  it.each([
    ['https://abc123.public.blob.vercel-storage.com/places/p/photo.jpg', 'optimized'],
    ['https://images.pexels.com/photos/1/pexels-photo-1.jpeg', 'optimized'],
    ['https://upload.wikimedia.org/wikipedia/commons/a/ab/Lisbon.jpg', 'optimized'],
    ['https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Lisbon.jpg/800px-Lisbon.jpg', 'optimized'],
    ['/bench/full-01.jpg?a=att_1', 'optimized'],
  ])('sends %s to the optimizer', (url, route) => {
    expect(photoRoute(url)).toBe(route);
  });

  it('keeps the Google resolver out of the optimizer, with or without a width', () => {
    expect(photoRoute('/api/photos/resolve/att_1')).toBe('resolver');
    expect(photoRoute('/api/photos/resolve/att_1?w=400')).toBe('resolver');
  });

  it.each([
    '/api/places/plc_1/anything',
    'http://images.pexels.com/photos/1.jpeg',
    'https://example.com/photo.jpg',
    'https://evil.com/x.public.blob.vercel-storage.com.jpg',
    '//images.pexels.com/photos/1.jpeg',
    'not a url',
  ])('leaves %s alone', (url) => {
    expect(photoRoute(url)).toBe('plain');
  });

  it('only optimizes hosts that next.config.js lets the optimizer fetch', () => {
    const patterns = nextConfig.images.remotePatterns;
    const allowed = (host: string) =>
      patterns.some(
        (p) =>
          p.protocol === 'https' &&
          (p.hostname.startsWith('**.')
            ? host.endsWith(p.hostname.slice(2))
            : p.hostname === host)
      );
    for (const url of [
      'https://abc123.public.blob.vercel-storage.com/a.jpg',
      'https://images.pexels.com/a.jpg',
      'https://upload.wikimedia.org/a.jpg',
      'https://thumb.wikimedia.org/a.jpg',
    ]) {
      expect(photoRoute(url)).toBe('optimized');
      expect(allowed(new URL(url).hostname)).toBe(true);
    }
    expect(allowed('example.com')).toBe(false);
  });
});

describe('resolver sizing', () => {
  it('replaces any width already on the URL', () => {
    expect(resolverSrc('/api/photos/resolve/att_1', 640)).toBe('/api/photos/resolve/att_1?w=640');
    expect(resolverSrc('/api/photos/resolve/att_1?w=400', 640)).toBe('/api/photos/resolve/att_1?w=640');
  });

  it('builds a width-descriptor srcset', () => {
    expect(resolverSrcSet('/api/photos/resolve/att_1?w=400', [160, 320])).toBe(
      '/api/photos/resolve/att_1?w=160 160w, /api/photos/resolve/att_1?w=320 320w'
    );
  });
});

describe('photoTint', () => {
  it('is stable for a photo and ignores the cache-busting query', () => {
    expect(photoTint('https://x.public.blob.vercel-storage.com/a.jpg')).toBe(
      photoTint('https://x.public.blob.vercel-storage.com/a.jpg?v=2')
    );
  });

  it('spreads photos across more than one tint', () => {
    const tints = new Set(Array.from({ length: 40 }, (_, i) => photoTint(`https://x/p${i}.jpg`)));
    expect(tints.size).toBeGreaterThan(2);
  });
});
