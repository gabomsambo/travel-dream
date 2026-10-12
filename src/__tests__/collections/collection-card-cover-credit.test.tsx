import { render, screen } from '@testing-library/react';
import { CollectionCard } from '@/components/collections/collection-card';
import type { AttributionMeta } from '@/db/schema/attachments';
import type { Collection } from '@/types/database';

jest.mock('@/components/collections/cover-image-picker-dialog', () => ({
  CoverImagePickerDialog: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

const pexels: AttributionMeta = {
  kind: 'pexels',
  photographer: 'Ada Lovelace',
  photographerUrl: 'https://www.pexels.com/@ada',
  photoUrl: 'https://www.pexels.com/photo/1',
};

const fallbackPexels: AttributionMeta = {
  kind: 'pexels',
  photographer: 'Grace Hopper',
  photographerUrl: 'https://www.pexels.com/@grace',
  photoUrl: 'https://www.pexels.com/photo/2',
};

function collection(over: Partial<Collection> & {
  coverAttribution?: AttributionMeta | null;
  coverSource?: string | null;
  places?: Array<{
    coverUrl?: string | null;
    coverAttribution?: AttributionMeta | null;
    coverSource?: string | null;
  }>;
}): Collection & typeof over {
  return {
    id: 'col_1',
    userId: 'user_1',
    name: 'Lisbon',
    description: null,
    filters: null,
    coverImageUrl: null,
    transportMode: 'drive',
    dayBuckets: [],
    unscheduledPlaceIds: [],
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...over,
  };
}

describe('CollectionCard cover credit', () => {
  it('shows the licensed photo credit on a custom cover', () => {
    render(
      <CollectionCard
        collection={collection({
          coverImageUrl: 'https://images.pexels.com/photos/1.jpeg',
          coverAttribution: pexels,
          coverSource: 'pexels',
          places: [{
            coverUrl: 'https://images.pexels.com/photos/fallback.jpeg',
            coverAttribution: fallbackPexels,
            coverSource: 'pexels',
          }],
        })}
      />,
    );

    expect(screen.getByRole('img', { name: 'Lisbon' })).toHaveAttribute(
      'src',
      'https://images.pexels.com/photos/1.jpeg',
    );
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      'https://www.pexels.com/@ada',
    );
    expect(screen.queryByRole('link', { name: 'Grace Hopper' })).not.toBeInTheDocument();
  });

  it('skips credit on a plain upload and restores the fallback photo credit when the cover is cleared', () => {
    const places = [{
      coverUrl: 'https://images.pexels.com/photos/fallback.jpeg',
      coverAttribution: fallbackPexels,
      coverSource: 'pexels',
    }];
    const { rerender } = render(
      <CollectionCard
        collection={collection({
          coverImageUrl: 'https://store.public.blob.vercel-storage.com/mine.jpg',
          coverAttribution: { kind: 'upload' },
          coverSource: 'upload',
          places,
        })}
      />,
    );

    expect(screen.getByRole('img', { name: 'Lisbon' })).toHaveAttribute(
      'src',
      'https://store.public.blob.vercel-storage.com/mine.jpg',
    );
    expect(screen.queryByRole('link', { name: 'Grace Hopper' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();

    rerender(
      <CollectionCard
        collection={collection({
          coverImageUrl: null,
          coverAttribution: { kind: 'upload' },
          coverSource: 'upload',
          places,
        })}
      />,
    );

    expect(screen.getByRole('img', { name: 'Lisbon' })).toHaveAttribute(
      'src',
      'https://images.pexels.com/photos/fallback.jpeg',
    );
    expect(screen.getByRole('link', { name: 'Grace Hopper' })).toBeInTheDocument();
  });

  it('does not keep a removed cover credit on the fallback upload', () => {
    render(
      <CollectionCard
        collection={collection({
          coverImageUrl: null,
          coverAttribution: pexels,
          coverSource: 'google_places',
          places: [{
            coverUrl: 'https://store.public.blob.vercel-storage.com/fallback.jpg',
            coverAttribution: null,
            coverSource: 'upload',
          }],
        })}
      />,
    );

    expect(screen.getByRole('img', { name: 'Lisbon' })).toHaveAttribute(
      'src',
      'https://store.public.blob.vercel-storage.com/fallback.jpg',
    );
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Powered by Google')).not.toBeInTheDocument();
  });
});
