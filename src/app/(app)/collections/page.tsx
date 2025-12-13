import { Metadata } from 'next';
import { getAllCollections } from '@/lib/db-queries';
import { CollectionsClient } from '@/components/collections/collections-client';
import { db } from '@/db';
import { placesToCollections } from '@/db/schema/relations';
import { eq, sql } from 'drizzle-orm';
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

  // Fetch all collections
  const collections = await getAllCollections(userId);

  // Get place counts for each collection
  const collectionsWithCounts = await Promise.all(
    collections.map(async (collection) => {
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(placesToCollections)
        .where(eq(placesToCollections.collectionId, collection.id));

      return {
        ...collection,
        placeCount: countResult[0]?.count || 0,
      };
    })
  );

  return <CollectionsClient initialCollections={collectionsWithCounts} />;
}
