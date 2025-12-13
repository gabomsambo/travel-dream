import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCollectionWithPlaces } from '@/lib/db-queries';
import { CollectionBuilder } from '@/components/collections/collection-builder';
import { auth } from '@/lib/auth';

interface CollectionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return { title: 'Collection | Travel Dreams' };
  }
  const collection = await getCollectionWithPlaces(id, session.user.id);

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
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  const userId = session.user.id;

  const { id } = await params;
  const collection = await getCollectionWithPlaces(id, userId);

  if (!collection) {
    notFound();
  }

  const collectionWithTypedTransport = {
    ...collection,
    transportMode: (collection.transportMode || 'drive') as 'drive' | 'walk',
  };

  return <CollectionBuilder initialCollection={collectionWithTypedTransport} />;
}
