import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCollectionWithPlaces } from '@/lib/db-queries';
import { CollectionBuilder } from '@/components/collections/collection-builder';
import { getCurrentUser } from '@/lib/auth-helpers';

interface CollectionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return { title: 'Collection | Travel Dreams' };
  }
  const collection = await getCollectionWithPlaces(id, user.id);

  if (!collection) {
    return {
      title: 'Collection Not Found | Travel Dreams',
    };
  }

  return {
    title: `${collection.name} | Travel Dreams`,
    description: collection.description || `Collection with ${collection.places.length} places`,
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { id } = await params;
  const collection = await getCollectionWithPlaces(id, user.id);

  if (!collection) {
    notFound();
  }

  const collectionWithTypedTransport = {
    ...collection,
    transportMode: (collection.transportMode || 'drive') as 'drive' | 'walk',
  };

  return <CollectionBuilder initialCollection={collectionWithTypedTransport} />;
}
