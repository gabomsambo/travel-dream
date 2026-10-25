import React from 'react';
import { render } from '@testing-library/react';
import { PlaceTile } from '@/components/explore/place-tile';
import { CountryTile } from '@/components/explore/country-tile';
import { CityTiles } from '@/components/explore/city-tiles';
import { LibraryCover } from '@/components/library/library-cover';
import { LibraryTile } from '@/components/library/library-tile';
import { AddToCollectionDialog } from '@/components/library/library-add-to-collection';
import { LibraryActionsContext, type LibraryActions } from '@/components/library/library-actions';
import { LibraryChapters } from '@/components/library/library-chapters';
import type { CountryGroup, ExplorePlace } from '@/lib/explore/types';
import { item } from '../helpers/library-items';

const BLOB = 'https://abc123.public.blob.vercel-storage.com/places/p/full.jpg';
const BLOB_THUMB = 'https://abc123.public.blob.vercel-storage.com/thumbnails/u/s_thumb.jpg';
const GOOGLE = '/api/photos/resolve/att_1';
const GOOGLE_THUMB = '/api/photos/resolve/att_1?w=400';

const actions: LibraryActions = {
  hearts: new Set(),
  toggleHeart: jest.fn(),
  selected: new Set(),
  selecting: false,
  toggleSelect: jest.fn(),
  select: jest.fn(),
  activate: jest.fn(),
  openPlace: jest.fn(),
  archive: jest.fn(),
  remove: jest.fn(),
  addToCollection: jest.fn(),
  findImage: jest.fn(),
};

function img(container: HTMLElement): HTMLImageElement {
  const el = container.querySelector('img');
  if (!el) throw new Error('no <img> rendered');
  return el;
}

function imgs(container: HTMLElement): HTMLImageElement[] {
  return [...container.querySelectorAll('img')];
}

/** The original URL behind a /_next/image request. */
function optimizedFrom(el: HTMLImageElement): string | null {
  const first = (el.getAttribute('srcset') ?? el.getAttribute('src') ?? '').split(' ')[0];
  return new URL(first, 'http://localhost').searchParams.get('url');
}

function place(photos: ExplorePlace['photos']): ExplorePlace {
  return {
    id: 'plc_1',
    name: 'Miradouro',
    kind: 'viewpoint',
    city: 'Lisbon',
    country: 'Portugal',
    description: null,
    notes: null,
    vibes: [],
    bestTimeText: null,
    bestTime: { months: [], yearRound: false, times: [] },
    recommendedBy: null,
    visitStatus: 'not_visited',
    priority: 0,
    ratingSelf: 0,
    priceLevel: null,
    createdAt: '2024-01-02T00:00:00.000Z',
    lat: null,
    lon: null,
    photos,
  };
}

function country(cover: string | null): CountryGroup {
  const p = place(cover ? [{ uri: cover, thumb: cover }] : []);
  return {
    country: 'Portugal',
    slug: 'portugal',
    flag: '🇵🇹',
    places: [p],
    cities: [
      {
        city: 'Lisbon',
        country: 'Portugal',
        slug: 'lisbon',
        places: [p],
        cover,
      },
    ],
    cover,
  };
}

function expectBlobSized(el: HTMLImageElement, expectedUrl: string, sizes: string) {
  expect(el.getAttribute('src')).toContain('/_next/image');
  expect(el.getAttribute('srcset') ?? el.getAttribute('src')).toContain('/_next/image');
  expect(optimizedFrom(el)).toBe(expectedUrl);
  expect(el.getAttribute('sizes')).toBe(sizes);
  // The raw blob URL is never the <img> src — only an optimizer `url` param.
  expect(el.getAttribute('src')).not.toBe(expectedUrl);
}

function expectGoogleSized(el: HTMLImageElement, widths: number[], sizes: string) {
  const srcset = el.getAttribute('srcset') ?? '';
  expect(srcset).not.toContain('_next/image');
  expect(el.getAttribute('src')).not.toContain('_next/image');
  expect(srcset).toBe(widths.map((w) => `${GOOGLE}?w=${w} ${w}w`).join(', '));
  expect(el.getAttribute('sizes')).toBe(sizes);
}

describe('Library and Explore photos are right-sized', () => {
  it('sizes a Library poster tile through the optimizer for Blob photos', () => {
    const libraryItem = item({
      id: 'plc_1',
      name: 'Miradouro',
      photos: [{ uri: BLOB, thumb: BLOB_THUMB }],
    });
    const { container } = render(
      <LibraryActionsContext.Provider value={actions}>
        <LibraryTile item={libraryItem} siblings={[libraryItem.id]} />
      </LibraryActionsContext.Provider>
    );
    expectBlobSized(img(container), BLOB, '(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw');
  });

  it('sizes an Explore landscape rail tile through the optimizer for Blob photos', () => {
    const { container } = render(
      <PlaceTile
        place={place([{ uri: BLOB, thumb: BLOB_THUMB }])}
        shape="landscape"
        onOpen={() => {}}
      />
    );
    expectBlobSized(img(container), BLOB, '(min-width: 640px) 340px, 72vw');
  });

  it('sizes PlaceTile Google photos with ?w= and never the optimizer', () => {
    const { container } = render(
      <PlaceTile
        place={place([{ uri: GOOGLE, thumb: GOOGLE_THUMB }])}
        shape="poster"
        onOpen={() => {}}
      />
    );
    expectGoogleSized(img(container), [320, 640, 960, 1280], '(min-width: 640px) 210px, 44vw');
  });

  it('sizes CountryTile and city covers for Blob and Google', () => {
    const blob = render(<CountryTile country={country(BLOB)} />);
    expectBlobSized(img(blob.container), BLOB, '(min-width: 768px) 25vw, 50vw');
    blob.unmount();

    const google = render(<CountryTile country={country(GOOGLE)} />);
    expectGoogleSized(img(google.container), [320, 640, 960, 1280], '(min-width: 768px) 25vw, 50vw');
    google.unmount();

    const cities = render(<CityTiles country={country(BLOB)} />);
    expectBlobSized(img(cities.container), BLOB, '(min-width: 1024px) 50vw, 100vw');
    cities.unmount();

    const cityGoogle = render(<CityTiles country={country(GOOGLE)} />);
    expectGoogleSized(img(cityGoogle.container), [320, 640, 960, 1280], '(min-width: 1024px) 50vw, 100vw');
  });

  it('sizes the Library cover collage through the optimizer', () => {
    const items = [
      item({
        id: 'plc_1',
        country: 'Portugal',
        photos: [{ uri: BLOB, thumb: BLOB_THUMB }],
      }),
    ];
    const { container } = render(
      <LibraryCover
        items={items}
        stats={{
          total: 1,
          countries: 1,
          cities: 1,
          been: 0,
          planned: 0,
          dreaming: 1,
          passport: [{ country: 'Portugal', flag: '🇵🇹', been: false }],
        }}
        onShelf={() => {}}
        onGroup={() => {}}
      />
    );
    expectBlobSized(img(container), BLOB, '(min-width: 640px) 40vw, 67vw');
  });

  it('keeps collection collage chips on thumb Google widths', () => {
    const member = item({
      id: 'plc_mem',
      photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }],
    });
    const byId = new Map([[member.id, member]]);
    render(
      <AddToCollectionDialog
        placeIds={['plc_1']}
        onOpenChange={() => {}}
        collections={[{ id: 'col_1', name: 'Lisbon', placeIds: [member.id] }]}
        byId={byId}
        onDone={() => {}}
      />
    );
    // LibrarySheet portals into document.body.
    const chip = imgs(document.body).find((el) => el.getAttribute('sizes') === '38px');
    expect(chip).toBeTruthy();
    expect(chip!.getAttribute('srcset')).toBe(
      `${GOOGLE}?w=160 160w, ${GOOGLE}?w=320 320w`
    );
    expect(chip!.getAttribute('srcset')).not.toContain('_next/image');
    expect(chip!.getAttribute('srcset')).not.toMatch(/\?w=640|\?w=960|\?w=1280/);
  });

  it('keeps chapter collage chips on thumb URLs, not the full image', () => {
    const blobPlaces = [
      item({ id: 'plc_a', photos: [{ uri: BLOB, thumb: BLOB_THUMB }] }),
      item({ id: 'plc_b', photos: [{ uri: BLOB, thumb: BLOB_THUMB }] }),
    ];
    const { container, unmount } = render(
      <LibraryActionsContext.Provider value={actions}>
        <LibraryChapters
          chapters={[{ key: 'collection:col_1', title: 'Lisbon trip', items: blobPlaces }]}
          group="collection"
          view="journal"
          siblings={blobPlaces.map((p) => p.id)}
          collectionNames={new Map()}
        />
      </LibraryActionsContext.Provider>
    );
    const collage = imgs(container).filter((el) => el.getAttribute('sizes') === '80px' || el.getAttribute('sizes') === '40px');
    expect(collage.length).toBeGreaterThan(0);
    for (const el of collage) {
      expectBlobSized(el, BLOB_THUMB, el.getAttribute('sizes')!);
      expect(optimizedFrom(el)).not.toBe(BLOB);
    }
    unmount();

    const googlePlaces = [
      item({ id: 'plc_g', photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }] }),
    ];
    const google = render(
      <LibraryActionsContext.Provider value={actions}>
        <LibraryChapters
          chapters={[{ key: 'collection:col_2', title: 'Google trip', items: googlePlaces }]}
          group="collection"
          view="journal"
          siblings={googlePlaces.map((p) => p.id)}
          collectionNames={new Map()}
        />
      </LibraryActionsContext.Provider>
    );
    const googleChip = imgs(google.container).find((el) => el.getAttribute('sizes') === '80px');
    expect(googleChip).toBeTruthy();
    expect(googleChip!.getAttribute('srcset')).toBe(
      `${GOOGLE}?w=160 160w, ${GOOGLE}?w=320 320w`
    );
    expect(googleChip!.getAttribute('srcset')).not.toContain('_next/image');
  });
});
