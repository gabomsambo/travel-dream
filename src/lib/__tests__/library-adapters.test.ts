import { parsePriceLevel, formatPriceSymbols, adaptPlaceForCard, FavoriteManager } from '../library-adapters';
import type { Place } from '@/types/database';

const mockPlace: Place = {
  id: 'plc_test123',
  name: 'Test Restaurant',
  kind: 'restaurant',
  city: 'Barcelona',
  country: 'ES',
  admin: null,
  coords: { lat: 41.3851, lon: 2.1734 },
  address: null,
  altNames: [],
  description: 'A great place to eat',
  tags: ['mediterranean', 'seafood'],
  vibes: ['romantic', 'upscale'],
  ratingSelf: 4,
  notes: null,
  status: 'library',
  confidence: 0.95,
  price_level: '$$$',
  best_time: 'evening',
  activities: null,
  cuisine: ['Spanish', 'Mediterranean'],
  amenities: ['WiFi', 'Outdoor seating'],
  createdAt: '2025-10-12T00:00:00.000Z',
  updatedAt: '2025-10-12T00:00:00.000Z',
  website: 'https://example.com',
  phone: '+34123456789',
  email: null,
  hours: null,
  visitStatus: 'not_visited',
  priority: 3,
  lastVisited: null,
  plannedVisit: null,
  recommendedBy: null,
  companions: null,
  practicalInfo: null,
};

describe('parsePriceLevel', () => {
  it('should parse "$" to 1', () => {
    expect(parsePriceLevel('$')).toBe(1);
  });

  it('should parse "$$" to 2', () => {
    expect(parsePriceLevel('$$')).toBe(2);
  });

  it('should parse "$$$" to 3', () => {
    expect(parsePriceLevel('$$$')).toBe(3);
  });

  it('should parse "$$$$" to 4', () => {
    expect(parsePriceLevel('$$$$')).toBe(4);
  });

  it('should return undefined for null', () => {
    expect(parsePriceLevel(null)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(parsePriceLevel('')).toBeUndefined();
  });
});

describe('formatPriceSymbols', () => {
  it('should format 1 to "$"', () => {
    expect(formatPriceSymbols(1)).toBe('$');
  });

  it('should format 2 to "$$"', () => {
    expect(formatPriceSymbols(2)).toBe('$$');
  });

  it('should format 3 to "$$$"', () => {
    expect(formatPriceSymbols(3)).toBe('$$$');
  });

  it('should format 4 to "$$$$"', () => {
    expect(formatPriceSymbols(4)).toBe('$$$$');
  });

  it('should return empty string for undefined', () => {
    expect(formatPriceSymbols(undefined)).toBe('');
  });

  it('should return empty string for 0', () => {
    expect(formatPriceSymbols(0)).toBe('');
  });

  it('should return empty string for values < 1', () => {
    expect(formatPriceSymbols(-1)).toBe('');
  });

  it('should return empty string for values > 4', () => {
    expect(formatPriceSymbols(5)).toBe('');
  });
});

describe('adaptPlaceForCard', () => {
  it('should add coverUrl to place', () => {
    const coverUrl = '/uploads/test.jpg';
    const adapted = adaptPlaceForCard(mockPlace, coverUrl);

    expect(adapted.coverUrl).toBe(coverUrl);
    expect(adapted.id).toBe(mockPlace.id);
    expect(adapted.name).toBe(mockPlace.name);
  });

  it('should handle undefined coverUrl', () => {
    const adapted = adaptPlaceForCard(mockPlace);

    expect(adapted.coverUrl).toBeUndefined();
    expect(adapted.id).toBe(mockPlace.id);
  });

  it('should preserve all original place fields', () => {
    const adapted = adaptPlaceForCard(mockPlace, '/test.jpg');

    expect(adapted.vibes).toEqual(mockPlace.vibes);
    expect(adapted.price_level).toBe(mockPlace.price_level);
    expect(adapted.ratingSelf).toBe(mockPlace.ratingSelf);
  });
});

describe('FavoriteManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty favorites', () => {
    const favorites = FavoriteManager.getFavorites();
    expect(favorites.size).toBe(0);
  });

  it('should add favorite', () => {
    FavoriteManager.toggleFavorite('place-1');

    const favorites = FavoriteManager.getFavorites();
    expect(favorites.has('place-1')).toBe(true);
    expect(favorites.size).toBe(1);
  });

  it('should remove favorite', () => {
    FavoriteManager.toggleFavorite('place-1');
    FavoriteManager.toggleFavorite('place-1');

    const favorites = FavoriteManager.getFavorites();
    expect(favorites.has('place-1')).toBe(false);
    expect(favorites.size).toBe(0);
  });

  it('should check if favorited', () => {
    expect(FavoriteManager.isFavorited('place-1')).toBe(false);

    FavoriteManager.toggleFavorite('place-1');

    expect(FavoriteManager.isFavorited('place-1')).toBe(true);
  });

  it('should persist favorites to localStorage', () => {
    FavoriteManager.toggleFavorite('place-1');
    FavoriteManager.toggleFavorite('place-2');

    const stored = localStorage.getItem('travel-dreams-favorites');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed).toContain('place-1');
    expect(parsed).toContain('place-2');
  });

  it('should load favorites from localStorage', () => {
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['place-1', 'place-2']));

    const favorites = FavoriteManager.getFavorites();
    expect(favorites.has('place-1')).toBe(true);
    expect(favorites.has('place-2')).toBe(true);
    expect(favorites.size).toBe(2);
  });
});
