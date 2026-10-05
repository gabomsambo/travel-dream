/**
 * Browser-safe helpers for place cards. Kept apart from `library-adapters`,
 * which reaches the tenant-scoped DB accessor: a client component importing a
 * value from there pulls the database client — and its credentials — into a
 * public JavaScript chunk. `@/db` is `server-only` now, so that fails the build.
 */

export function parsePriceLevel(priceString: string | null): number | undefined {
  if (!priceString) return undefined;
  return priceString.length;
}

export function formatPriceSymbols(priceLevel: number | undefined): string {
  if (!priceLevel || priceLevel < 1 || priceLevel > 4) return '';
  return '$'.repeat(priceLevel);
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
