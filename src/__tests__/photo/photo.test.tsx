import { render } from '@testing-library/react';
import { Photo } from '@/components/photo';

const BLOB = 'https://abc123.public.blob.vercel-storage.com/places/p/full.jpg';
const BLOB_THUMB = 'https://abc123.public.blob.vercel-storage.com/thumbnails/u/s_thumb.jpg';

function img(container: HTMLElement): HTMLImageElement {
  const el = container.querySelector('img');
  if (!el) throw new Error('no <img> rendered');
  return el;
}

/** The original URL behind a /_next/image request. */
function optimizedFrom(el: HTMLImageElement): string | null {
  const first = (el.getAttribute('srcset') ?? el.getAttribute('src') ?? '').split(' ')[0];
  return new URL(first, 'http://localhost').searchParams.get('url');
}

describe('Photo', () => {
  it('resizes a Blob photo through the optimizer with the box it was given', () => {
    const { container } = render(<Photo src={BLOB} sizes="(min-width: 640px) 210px, 44vw" />);
    const el = img(container);
    expect(el.getAttribute('src')).toContain('/_next/image');
    expect(optimizedFrom(el)).toBe(BLOB);
    expect(el.getAttribute('sizes')).toBe('(min-width: 640px) 210px, 44vw');
    expect(el.getAttribute('loading')).toBe('lazy');
  });

  it('starts from the full image unless the box is small', () => {
    const big = render(<Photo src={BLOB} thumb={BLOB_THUMB} sizes="210px" />);
    expect(optimizedFrom(img(big.container))).toBe(BLOB);
    const small = render(<Photo src={BLOB} thumb={BLOB_THUMB} use="thumb" sizes="56px" />);
    expect(optimizedFrom(img(small.container))).toBe(BLOB_THUMB);
  });

  it('uses the full image for a small box when there is no thumbnail', () => {
    const { container } = render(<Photo src={BLOB} use="thumb" sizes="56px" />);
    expect(optimizedFrom(img(container))).toBe(BLOB);
  });

  it('preloads the LCP photo', () => {
    const { container } = render(<Photo src={BLOB} sizes="100vw" priority />);
    const el = img(container);
    expect(el.getAttribute('fetchpriority')).toBe('high');
    expect(el.getAttribute('loading')).not.toBe('lazy');
  });

  it('sizes a Google photo with ?w= and never sends it to the optimizer', () => {
    const { container } = render(<Photo src="/api/photos/resolve/att_1" sizes="210px" />);
    const el = img(container);
    expect(el.getAttribute('src')).toBe('/api/photos/resolve/att_1?w=640');
    expect(el.getAttribute('srcset')).toBe(
      '/api/photos/resolve/att_1?w=320 320w, /api/photos/resolve/att_1?w=640 640w, ' +
        '/api/photos/resolve/att_1?w=960 960w, /api/photos/resolve/att_1?w=1280 1280w'
    );
    expect(el.getAttribute('srcset')).not.toContain('_next/image');
  });

  it('asks for a small Google image in a small box', () => {
    const { container } = render(
      <Photo src="/api/photos/resolve/att_1" thumb="/api/photos/resolve/att_1?w=400" use="thumb" sizes="56px" />
    );
    expect(img(container).getAttribute('srcset')).toBe(
      '/api/photos/resolve/att_1?w=160 160w, /api/photos/resolve/att_1?w=320 320w'
    );
  });

  it('leaves a photo on an unknown host as it is', () => {
    const { container } = render(<Photo src="https://example.com/p.jpg" sizes="100px" />);
    const el = img(container);
    expect(el.getAttribute('src')).toBe('https://example.com/p.jpg');
    expect(el.getAttribute('srcset')).toBeNull();
  });

  it('shows a tint until the photo arrives, and passes the caller classes', () => {
    const { container } = render(<Photo src={BLOB} sizes="100px" className="opacity-90" />);
    const cls = img(container).className;
    expect(cls).toMatch(/bg-gradient-to-br/);
    expect(cls).toContain('opacity-90');
    expect(cls).toContain('object-cover');
  });
});
