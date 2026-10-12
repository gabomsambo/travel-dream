import { Metadata } from 'next';
import { getAllCollections } from '@/lib/db-queries';
import { CollectionsClient } from '@/components/collections/collections-client';
import { placesToCollections } from '@/db/schema/relations';
import { eq, sql } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';
import { getCollectionCardCovers } from '@/lib/library-adapters';
import { auth } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Collections | Travel Dreams',
  description: 'Organize your travel places into curated collections',
};

export default async function CollectionsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  const userId = session.user.id;
  const tdb = forUser(userId);

  // Fetch all collections
  const collections = await getAllCollections(userId);

  // Get place counts for each collection
  const collectionsWithCounts = await Promise.all(
    collections.map(async (collection) => {
      // `places_to_collections` has no user_id; the accessor scopes it through
      // the caller's collections, so owning the id we are counting by is not
      // taken on trust from `getAllCollections`.
      const countResult = await tdb.selectFieldsVia(
        placesToCollections,
        { count: sql<number>`count(*)` },
        eq(placesToCollections.collectionId, collection.id)
      );

      return {
        ...collection,
        placeCount: countResult[0]?.count || 0,
      };
    })
  );

  const placeCovers = await getCollectionCardCovers(
    collectionsWithCounts.map((c) => c.id),
    userId
  );

  const collectionsForClient = collectionsWithCounts.map((collection) => {
    const fallback = placeCovers.get(collection.id);
    const useCustomCover = Boolean(collection.coverImageUrl);
    return {
      ...collection,
      coverAttribution: useCustomCover ? null : (fallback?.coverAttribution ?? null),
      coverSource: useCustomCover ? null : (fallback?.coverSource ?? null),
      places:
        !useCustomCover && fallback?.coverUrl
          ? [{ coverUrl: fallback.coverUrl }]
          : undefined,
    };
  });

  return <CollectionsClient initialCollections={collectionsForClient} />;
}
