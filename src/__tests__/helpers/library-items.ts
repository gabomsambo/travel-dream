import type { LibraryItem } from '@/lib/library/types';

/** A Library place with sensible defaults; override what a test cares about. */
export function item(overrides: Partial<LibraryItem> & { id: string }): LibraryItem {
  return {
    name: overrides.id,
    kind: 'landmark',
    city: 'Kyoto',
    country: 'Japan',
    description: null,
    notes: null,
    vibes: [],
    bestTimeText: null,
    bestTime: { months: [], yearRound: false, times: [] },
    recommendedBy: null,
    visitStatus: 'not_visited',
    priority: 0,
    ratingSelf: 0,
    priceLevel: null,
    createdAt: '2025-03-01T10:00:00Z',
    lastVisited: null,
    plannedVisit: null,
    lat: null,
    lon: null,
    photos: [],
    tags: [],
    address: null,
    altNames: [],
    cuisine: [],
    activities: [],
    amenities: [],
    practicalInfo: null,
    ...overrides,
  };
}

export const photo = { uri: 'https://store.public.blob.vercel-storage.com/p.jpg', thumb: 'https://store.public.blob.vercel-storage.com/p-t.jpg' };
