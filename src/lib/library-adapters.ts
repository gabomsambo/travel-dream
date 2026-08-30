import type { Place } from '@/types/database';
import type { LibraryPlace } from './db-queries';
import { attachments } from '@/db/schema';
import { inArray, eq, and } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';

export interface PlaceWithCover extends Place {
  coverUrl?: string;
}

/**
 * Cover-augmented row for /library and /archive routes.
 * Extends LibraryPlace (narrow projection) instead of Place.
 */
export interface LibraryPlaceWithCover extends LibraryPlace {
  coverUrl?: string;
}

export function adaptPlaceForCard(place: Place, coverUrl?: string): PlaceWithCover {
  return {
    ...place,
    coverUrl,
  };
}

export function parsePriceLevel(priceString: string | null): number | undefined {
  if (!priceString) return undefined;
  return priceString.length;
}

export function formatPriceSymbols(priceLevel: number | undefined): string {
  if (!priceLevel || priceLevel < 1 || priceLevel > 4) return '';
  return '$'.repeat(priceLevel);
}

/**
 * Primary-image URLs for a list of place ids.
 *
 * `userId` is required, and the query is scoped through the caller's places —
 * `attachments` carries no `user_id` of its own. The id list is an input to
 * filter, not a statement about ownership: this used to take bare place ids and
 * was safe only because both call sites happened to pass an already-scoped
 * list. Safe by signature beats safe by caller discipline.
 */
export async function getCoverImagesForPlaces(
  placeIds: string[],
  userId: string
): Promise<Map<string, string>> {
  if (placeIds.length === 0) return new Map();

  const covers = await forUser(userId).selectFieldsVia(
    attachments,
    {
      placeId: attachments.placeId,
      uri: attachments.uri,
    },
    and(inArray(attachments.placeId, placeIds), eq(attachments.isPrimary, 1))
  );

  return new Map(covers.map((cover) => [cover.placeId, cover.uri]));
}

export class FavoriteManager {
  private static STORAGE_KEY = 'travel-dreams-favorites';

  static getFavorites(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  }

  static toggleFavorite(placeId: string): void {
    const favorites = this.getFavorites();
    if (favorites.has(placeId)) {
      favorites.delete(placeId);
    } else {
      favorites.add(placeId);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify([...favorites]));
  }

  static isFavorited(placeId: string): boolean {
    return this.getFavorites().has(placeId);
  }
}
