import { render, screen } from '@testing-library/react';
import { ArchiveJournal } from '@/components/archive/archive-journal';
import { ArchiveList } from '@/components/archive/archive-list';
import { PoweredByGoogle } from '@/components/attribution/powered-by-google';
import { PlaceTile } from '@/components/explore/place-tile';
import { HeroSection } from '@/components/places/place-full-view-sections/hero-section';
import { PlaceHero } from '@/components/places/place-view/place-hero';
import type { ArchivePlace } from '@/lib/archive/view';
import type { ExplorePlace } from '@/lib/explore/types';
import type { Attachment, PlaceWithRelations } from '@/types/database';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/place/plc_1',
}));

const pexels = {
  kind: 'pexels' as const,
  photographer: 'Ada Lovelace',
  photographerUrl: 'https://www.pexels.com/@ada',
  photoUrl: 'https://www.pexels.com/photo/1',
};

const archivePlace: ArchivePlace = {
  id: 'plc_1',
  name: 'Miradouro',
  kind: 'viewpoint',
  city: 'Lisbon',
  country: 'Portugal',
  description: null,
  notes: null,
  tags: [],
  vibes: [],
  ratingSelf: 0,
  visitStatus: 'visited',
  priceLevel: null,
  coverUrl: 'https://images.pexels.com/photos/1.jpeg',
  coverAttribution: pexels,
  coverSource: 'pexels',
  createdAt: '2024-01-02T00:00:00.000Z',
  archivedAt: '2026-03-12T00:00:00.000Z',
  trips: [],
  status: 'archived',
};

const explorePlace: ExplorePlace = {
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
  visitStatus: 'visited',
  priority: 0,
  ratingSelf: 0,
  priceLevel: null,
  createdAt: '2024-01-02T00:00:00.000Z',
  lat: null,
  lon: null,
  photos: [{
    thumb: 'https://images.pexels.com/photos/1.jpeg',
    uri: 'https://images.pexels.com/photos/1.jpeg',
    attribution: pexels,
    source: 'pexels',
  }],
};

function googlePhoto(): Attachment {
  return {
    id: 'att_1',
    placeId: 'plc_1',
    type: 'photo',
    uri: '/api/photos/resolve/att_1',
    filename: 'a.jpg',
    mimeType: 'image/jpeg',
    fileSize: 10,
    width: 100,
    height: 80,
    thumbnailUri: null,
    caption: null,
    takenAt: null,
    isPrimary: 1,
    createdAt: '2024-01-02T00:00:00.000Z',
    source: 'google_places',
    sourceId: 'photo-name',
    attribution: { kind: 'google_places', authorAttributions: [] },
  };
}

function expectLightWordmark(scope: HTMLElement) {
  const badge = scope.querySelector('[aria-label="Powered by Google"]');
  expect(badge).not.toBeNull();
  const imgs = badge!.querySelectorAll('img');
  expect(imgs).toHaveLength(1);
  expect(imgs[0]).toHaveAttribute('src', '/attribution/powered-by-google-light.svg');
}

describe('photo credit surfaces', () => {
  it('places the tile credit before the name and outside the open button', () => {
    render(
      <PlaceTile place={explorePlace} shape="poster" onOpen={() => {}} />,
    );

    const open = screen.getByRole('button', { name: /Miradouro/ });
    const credit = screen.getByRole('link', { name: 'Ada Lovelace' });
    const heading = screen.getByRole('heading', { name: 'Miradouro' });
    expect(open.contains(credit)).toBe(false);
    expect(credit.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps archive credits outside the place link', () => {
    const handlers = { selected: new Set<string>(), onToggle: () => {}, onRestore: () => {}, onDelete: () => {} };
    const { unmount } = render(<ArchiveList places={[archivePlace]} {...handlers} />);
    const listThumb = screen.getByRole('link', { name: 'Open Miradouro' });
    const listCredit = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(listThumb.contains(listCredit)).toBe(false);
    expect(listCredit).toHaveAttribute('href', 'https://www.pexels.com/@ada');
    unmount();

    render(<ArchiveJournal places={[archivePlace]} {...handlers} />);
    const journalPhoto = screen.getByRole('link', { name: 'Open Miradouro' });
    const journalCredit = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(journalPhoto.contains(journalCredit)).toBe(false);
    expect(journalCredit).toHaveAttribute('href', 'https://www.pexels.com/@ada');
  });

  it('uses the light-background Google asset on a fixed light chip', () => {
    const { container, unmount } = render(<PoweredByGoogle onLightSurface />);
    expectLightWordmark(container);
    unmount();

    const { container: themed } = render(<PoweredByGoogle />);
    expect(themed.querySelectorAll('[aria-label="Powered by Google"] img')).toHaveLength(2);

    const photo = googlePhoto();
    const place = {
      id: 'plc_1',
      name: 'Cafe',
      kind: 'cafe',
      status: 'library',
      country: 'Portugal',
      city: 'Lisbon',
      vibes: [],
      visitStatus: 'visited',
      priority: 0,
      googlePlaceId: null,
      attachments: [photo],
      links: [],
      reservations: [],
      sources: [],
      collections: [],
    } as PlaceWithRelations;

    const hero = render(
      <PlaceHero
        place={place}
        photos={[photo]}
        onEdit={() => {}}
        onOpenPhoto={() => {}}
        onPhotoAttached={() => {}}
      />,
    );
    expectLightWordmark(hero.container);
    hero.unmount();

    const editor = render(
      <HeroSection
        place={place}
        formData={{ name: 'Cafe', kind: 'cafe', ratingSelf: 0, description: '' }}
        updateField={() => {}}
      />,
    );
    expectLightWordmark(editor.container);
  });
});
