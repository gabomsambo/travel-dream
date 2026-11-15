/**
 * @jest-environment jsdom
 *
 * A TikTok carousel import is stored as a private Vercel Blob URL. The browser
 * has no token for that store, so the full-size lightbox has to ask the app for
 * the bytes — exactly like the thumbnail and grid paths do.
 */

jest.mock('yet-another-react-lightbox', () => ({
  __esModule: true,
  default: ({ slides }: { slides: Array<{ src: string; description?: React.ReactNode }> }) => (
    <div role="dialog">
      {slides.map((slide) => (
        <div key={slide.src}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.src} alt="slide" />
          {slide.description}
        </div>
      ))}
    </div>
  ),
}));
jest.mock('yet-another-react-lightbox/plugins/captions', () => ({
  __esModule: true,
  default: () => null,
}));

import { render, screen } from '@testing-library/react';
import { PhotoLightbox } from '@/components/ui-custom/photo-lightbox';
import type { Attachment } from '@/types/database';

const PRIVATE_URL = 'https://travel-dream.private.blob.vercel-storage.com/tiktok-imports/u/1.jpg';
const PUBLIC_URL = 'https://travel-dream.public.blob.vercel-storage.com/places/plc_1/photo.jpg';

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att_1',
    placeId: 'plc_1',
    type: 'photo',
    uri: PRIVATE_URL,
    filename: '@creator-post-1.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 1080,
    height: 1440,
    thumbnailUri: null,
    caption: null,
    takenAt: null,
    isPrimary: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'upload',
    sourceId: null,
    attribution: null,
    ...overrides,
  };
}

function slideSrcs(): string[] {
  return Array.from(document.querySelectorAll('img'))
    .map((img) => img.getAttribute('src') ?? '')
    .filter((src) => src.length > 0);
}

describe('PhotoLightbox', () => {
  it('shows a private import through the authenticated photo route', () => {
    render(<PhotoLightbox photos={[attachment()]} open index={0} onClose={() => {}} />);

    const srcs = slideSrcs();
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toContain('/api/photos/private?url=');
    expect(srcs[0]).toContain(encodeURIComponent(PRIVATE_URL));
  });

  it('leaves a public photo on its own URL', () => {
    render(
      <PhotoLightbox
        photos={[attachment({ uri: PUBLIC_URL })]}
        open
        index={0}
        onClose={() => {}}
      />
    );

    expect(slideSrcs()[0]).toBe(PUBLIC_URL);
  });

  it('credits the TikTok post the photo came from', () => {
    render(
      <PhotoLightbox
        photos={[attachment({
          source: 'upload',
          attribution: {
            kind: 'tiktok',
            postUrl: 'https://www.tiktok.com/@creator/photo/7694185850497666335',
            handle: 'creator',
          },
        })]}
        open
        index={0}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('link', { name: /@creator/ })).toHaveAttribute(
      'href',
      'https://www.tiktok.com/@creator/photo/7694185850497666335',
    );
  });
});
