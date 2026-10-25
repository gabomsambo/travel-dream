import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { PlaceTile } from '@/components/explore/place-tile';
import { CountryTile } from '@/components/explore/country-tile';
import { CityTiles } from '@/components/explore/city-tiles';
import { TopCitiesRail } from '@/components/explore/top-cities-rail';
import { TripMoment } from '@/components/explore/trip-moment';
import { TripNudgeCard } from '@/components/explore/trip-nudge-card';
import { ExploreProvider } from '@/components/explore/explore-provider';
import { LibraryCover } from '@/components/library/library-cover';
import { LibraryTile } from '@/components/library/library-tile';
import { AddToCollectionDialog } from '@/components/library/library-add-to-collection';
import { LibraryActionsContext, type LibraryActions } from '@/components/library/library-actions';
import { LibraryChapters } from '@/components/library/library-chapters';
import { TripsShelf } from '@/components/library/library-shelves';
import { BrowseAll } from '@/components/explore/browse-all';
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
      item({
        id: 'plc_2',
        country: 'Japan',
        photos: [{ uri: BLOB, thumb: BLOB_THUMB }],
      }),
    ];
    const { container } = render(
      <LibraryCover
        items={items}
        stats={{
          total: 2,
          countries: 2,
          cities: 2,
          been: 0,
          planned: 0,
          dreaming: 2,
          passport: [
            { country: 'Portugal', flag: '🇵🇹', been: false },
            { country: 'Japan', flag: '🇯🇵', been: false },
          ],
        }}
        onShelf={() => {}}
        onGroup={() => {}}
      />
    );
    const coverImgs = imgs(container);
    expect(coverImgs.length).toBeGreaterThanOrEqual(2);
    expectBlobSized(coverImgs[0], BLOB, '(min-width: 640px) 40vw, 67vw');
    expectBlobSized(coverImgs[1], BLOB_THUMB, '(min-width: 640px) 20vw, 34vw');
  });

  it('keeps Library cover secondary Google cells on thumb widths', () => {
    const items = [
      item({
        id: 'plc_1',
        country: 'Portugal',
        photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }],
      }),
      item({
        id: 'plc_2',
        country: 'Japan',
        photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }],
      }),
    ];
    const { container } = render(
      <LibraryCover
        items={items}
        stats={{
          total: 2,
          countries: 2,
          cities: 2,
          been: 0,
          planned: 0,
          dreaming: 2,
          passport: [
            { country: 'Portugal', flag: '🇵🇹', been: false },
            { country: 'Japan', flag: '🇯🇵', been: false },
          ],
        }}
        onShelf={() => {}}
        onGroup={() => {}}
      />
    );
    const coverImgs = imgs(container);
    expectGoogleSized(coverImgs[0], [320, 640, 960, 1280], '(min-width: 640px) 40vw, 67vw');
    expectGoogleSized(coverImgs[1], [160, 320], '(min-width: 640px) 20vw, 34vw');
  });

  it('keeps Top Cities rail covers on thumb Google widths', () => {
    const { container } = render(
      <TopCitiesRail
        cities={[
          {
            city: 'Lisbon',
            country: 'Portugal',
            slug: 'lisbon',
            places: [place([{ uri: GOOGLE, thumb: GOOGLE_THUMB }])],
            cover: GOOGLE,
          },
        ]}
      />
    );
    expectGoogleSized(img(container), [160, 320], '(min-width: 640px) 150px, 34vw');
  });

  it('keeps trip-nudge fan photos on thumb Google widths', () => {
    const uris = [
      '/api/photos/resolve/att_1',
      '/api/photos/resolve/att_2',
      '/api/photos/resolve/att_3',
    ];
    const { container } = render(
      <ExploreProvider places={[]} collections={[]}>
        <TripNudgeCard
          dismissible={false}
          nudge={{
            city: 'Lisbon',
            country: 'Portugal',
            citySlug: 'lisbon',
            countrySlug: 'portugal',
            placeIds: ['plc_1', 'plc_2'],
            photos: uris,
            kinds: ['viewpoint'],
            existingCollection: null,
          }}
        />
      </ExploreProvider>
    );
    const fans = imgs(container).filter((el) => el.getAttribute('sizes') === '144px');
    expect(fans.length).toBe(3);
    for (const el of fans) {
      const srcset = el.getAttribute('srcset') ?? '';
      expect(srcset).not.toContain('_next/image');
      expect(srcset).toMatch(/\?w=160 160w, .*\?w=320 320w/);
      expect(srcset).not.toMatch(/\?w=640|\?w=960|\?w=1280/);
      expect(el.getAttribute('sizes')).toBe('144px');
    }
  });

  it('keeps TripMoment secondary collage cells on thumb Google widths', async () => {
    const uris = [
      '/api/photos/resolve/att_1',
      '/api/photos/resolve/att_2',
      '/api/photos/resolve/att_3',
    ];
    const { container } = render(
      <ExploreProvider places={[]} collections={[]}>
        <TripMoment
          nudge={{
            city: 'Lisbon',
            country: 'Portugal',
            citySlug: 'lisbon',
            countrySlug: 'portugal',
            placeIds: ['plc_1', 'plc_2', 'plc_3'],
            photos: uris,
            kinds: ['viewpoint'],
            existingCollection: null,
          }}
        />
      </ExploreProvider>
    );
    await waitFor(() => {
      expect(imgs(container).length).toBe(3);
    });
    const collage = imgs(container);
    const lead = collage.find((el) => el.getAttribute('sizes') === '(min-width: 768px) 400px, 60vw');
    const secondaries = collage.filter(
      (el) => el.getAttribute('sizes') === '(min-width: 768px) 200px, 30vw'
    );
    expect(lead).toBeTruthy();
    expect(secondaries).toHaveLength(2);
    expect(lead!.getAttribute('srcset')).toMatch(/\?w=320 320w.*\?w=640 640w.*\?w=960 960w.*\?w=1280 1280w/);
    expect(lead!.getAttribute('srcset')).not.toContain('_next/image');
    for (const el of secondaries) {
      const srcset = el.getAttribute('srcset') ?? '';
      expect(srcset).not.toContain('_next/image');
      expect(srcset).toMatch(/\?w=160 160w, .*\?w=320 320w/);
      expect(srcset).not.toMatch(/\?w=640|\?w=960|\?w=1280/);
    }
  });

  it('sizes BrowseAll covers from the full uri through the optimizer', () => {
    const { container } = render(
      <BrowseAll
        rails={[
          {
            id: 'moods-lisbon',
            title: 'Lisbon moods',
            group: 'moods',
            count: 3,
            cover: BLOB,
            fallback: { name: 'Miradouro', kind: 'viewpoint' },
          },
        ]}
      />
    );
    expectBlobSized(
      img(container),
      BLOB,
      '(min-width: 1536px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'
    );
    expect(optimizedFrom(img(container))).not.toBe(BLOB_THUMB);
  });

  it('feeds TripMoment lead Blob covers the full uri, not the 400px thumb', async () => {
    const { container } = render(
      <ExploreProvider places={[]} collections={[]}>
        <TripMoment
          nudge={{
            city: 'Lisbon',
            country: 'Portugal',
            citySlug: 'lisbon',
            countrySlug: 'portugal',
            placeIds: ['plc_1', 'plc_2', 'plc_3'],
            photos: [BLOB, BLOB_THUMB, BLOB_THUMB],
            kinds: ['viewpoint'],
            existingCollection: null,
          }}
        />
      </ExploreProvider>
    );
    await waitFor(() => {
      expect(imgs(container).length).toBe(3);
    });
    const lead = imgs(container).find((el) => el.getAttribute('sizes') === '(min-width: 768px) 400px, 60vw');
    expect(lead).toBeTruthy();
    expectBlobSized(lead!, BLOB, '(min-width: 768px) 400px, 60vw');
    expect(optimizedFrom(lead!)).not.toBe(BLOB_THUMB);
  });

  it('keeps TripsShelf collage lead on the full uri and secondaries on thumb', () => {
    const a = item({ id: 'plc_a', photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }] });
    const b = item({ id: 'plc_b', photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }] });
    const c = item({ id: 'plc_c', photos: [{ uri: GOOGLE, thumb: GOOGLE_THUMB }] });
    const google = render(
      <TripsShelf
        collections={[{ id: 'col_1', name: 'Lisbon', placeIds: [a.id, b.id, c.id] }]}
        byId={new Map([
          [a.id, a],
          [b.id, b],
          [c.id, c],
        ])}
        now={new Date('2024-06-01T00:00:00.000Z')}
      />
    );
    const collage = imgs(google.container);
    expect(collage.length).toBe(3);
    expectGoogleSized(
      collage[0],
      [320, 640, 960, 1280],
      '(min-width: 1024px) 160px, (min-width: 640px) 220px, 26vw'
    );
    expectGoogleSized(
      collage[1],
      [160, 320],
      '(min-width: 1024px) 80px, (min-width: 640px) 110px, 13vw'
    );
    expectGoogleSized(
      collage[2],
      [160, 320],
      '(min-width: 1024px) 80px, (min-width: 640px) 110px, 13vw'
    );
    google.unmount();

    const ba = item({ id: 'plc_ba', photos: [{ uri: BLOB, thumb: BLOB_THUMB }] });
    const bb = item({ id: 'plc_bb', photos: [{ uri: BLOB, thumb: BLOB_THUMB }] });
    const bc = item({ id: 'plc_bc', photos: [{ uri: BLOB, thumb: BLOB_THUMB }] });
    const blob = render(
      <TripsShelf
        collections={[{ id: 'col_blob', name: 'Blob trip', placeIds: [ba.id, bb.id, bc.id] }]}
        byId={new Map([
          [ba.id, ba],
          [bb.id, bb],
          [bc.id, bc],
        ])}
        now={new Date('2024-06-01T00:00:00.000Z')}
      />
    );
    const blobCollage = imgs(blob.container);
    expectBlobSized(
      blobCollage[0],
      BLOB,
      '(min-width: 1024px) 160px, (min-width: 640px) 220px, 26vw'
    );
    expectBlobSized(
      blobCollage[1],
      BLOB_THUMB,
      '(min-width: 1024px) 80px, (min-width: 640px) 110px, 13vw'
    );
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
