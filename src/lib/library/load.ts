import { searchLibraryPlaces } from '@/lib/db-queries';
import { getExploreCollections, getExplorePlaces } from '@/lib/explore/queries';
import type { LibraryData, LibraryItem } from './types';

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Everything the Library page renders, for one user.
 *
 * Composes three queries that are each scoped to `userId` on their own
 * (`searchLibraryPlaces` filters on `places.user_id`; the Explore loaders go
 * through `forUser`), so no row of another tenant can enter the join. The
 * library rows decide membership — Explore's list also holds Inbox places, and
 * those are only counted, never shown.
 */
export async function loadLibrary(userId: string): Promise<LibraryData> {
  const [rows, explore, collections] = await Promise.all([
    searchLibraryPlaces({ userId, status: 'library' }),
    getExplorePlaces(userId),
    getExploreCollections(userId),
  ]);

  const byId = new Map(explore.map((p) => [p.id, p]));
  const items: LibraryItem[] = [];
  for (const row of rows) {
    const place = byId.get(row.id);
    if (!place) continue;
    items.push({
      ...place,
      tags: strings(row.tags),
      address: row.address,
      altNames: strings(row.altNames),
      cuisine: strings(row.cuisine),
      activities: strings(row.activities),
      amenities: strings(row.amenities),
      practicalInfo: row.practicalInfo,
    });
  }

  const libraryIds = new Set(rows.map((r) => r.id));
  const inboxCount = explore.filter((p) => !libraryIds.has(p.id)).length;

  return { items, collections, inboxCount };
}
