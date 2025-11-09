import type { Place } from '@/types/database';
import { db } from '@/db';
import { attachments } from '@/db/schema';
import { inArray, eq, and } from 'drizzle-orm';

export interface PlaceWithCover extends Place {
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

export async function getCoverImagesForPlaces(
  placeIds: string[]
): Promise<Map<string, string>> {
  if (placeIds.length === 0) return new Map();

  const covers = await db
    .select({
      placeId: attachments.placeId,
      uri: attachments.uri,
    })
    .from(attachments)
    .where(
      and(
        inArray(attachments.placeId, placeIds),
        eq(attachments.isPrimary, 1)
      )
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
