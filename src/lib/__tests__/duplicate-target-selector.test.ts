import {
  calculateDataCompleteness,
  recommendMergeTarget,
  computeMergedPlace,
} from '../duplicate-target-selector';
import type { Place } from '@/types/database';

const createMockPlace = (overrides: Partial<Place> = {}): Place => ({
  id: `plc_${Math.random().toString(36).slice(2)}`,
  name: 'Test Place',
  kind: 'restaurant',
  city: null,
  country: null,
  admin: null,
  coords: null,
  address: null,
  googlePlaceId: null,
  altNames: [],
  description: null,
  tags: [],
  vibes: [],
  ratingSelf: 0,
  notes: null,
  status: 'inbox',
  confidence: 0.5,
  price_level: null,
  best_time: null,
  activities: [],
  cuisine: [],
  amenities: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  website: null,
  phone: null,
  email: null,
  hours: null,
  visitStatus: 'not_visited',
  priority: 0,
  lastVisited: null,
  plannedVisit: null,
  recommendedBy: null,
  companions: null,
  practicalInfo: null,
  ...overrides,
});

describe('calculateDataCompleteness', () => {
  it('scores place with all fields highly', () => {
    const fullPlace = createMockPlace({
      coords: { lat: 40.7128, lon: -74.006 },
      description: 'A great restaurant',
      address: '123 Main St',
      tags: ['italian', 'cozy'],
      vibes: ['romantic', 'quiet'],
      activities: ['dining', 'wine tasting'],
      amenities: ['wifi', 'outdoor seating'],
      cuisine: ['italian', 'mediterranean'],
      altNames: ['The Italian Place'],
      notes: 'Must try the pasta',
      price_level: '$$$',
      practicalInfo: 'Reservations recommended',
      status: 'library',
      confidence: 0.95,
    });

    const result = calculateDataCompleteness(fullPlace);
    expect(result.score).toBe(100);
    expect(result.factors.hasCoords).toBe(true);
    expect(result.factors.hasDescription).toBe(true);
    expect(result.factors.isInLibrary).toBe(true);
    expect(result.factors.hasHighConfidence).toBe(true);
  });

  it('scores empty place low', () => {
    const emptyPlace = createMockPlace();

    const result = calculateDataCompleteness(emptyPlace);
    expect(result.score).toBeLessThan(30);
    expect(result.factors.hasCoords).toBe(false);
    expect(result.factors.hasDescription).toBe(false);
  });

  it('correctly identifies coordinates', () => {
    const placeWithCoords = createMockPlace({
      coords: { lat: 51.5074, lon: -0.1278 },
    });
    const placeWithoutCoords = createMockPlace({ coords: null });

    expect(calculateDataCompleteness(placeWithCoords).factors.hasCoords).toBe(true);
    expect(calculateDataCompleteness(placeWithoutCoords).factors.hasCoords).toBe(false);
  });

  it('correctly identifies library status', () => {
    const libraryPlace = createMockPlace({ status: 'library' });
    const inboxPlace = createMockPlace({ status: 'inbox' });

    expect(calculateDataCompleteness(libraryPlace).factors.isInLibrary).toBe(true);
    expect(calculateDataCompleteness(inboxPlace).factors.isInLibrary).toBe(false);
  });
});

describe('recommendMergeTarget', () => {
  it('returns place with highest completeness', () => {
    const sparsePlace = createMockPlace({
      id: 'sparse',
      name: 'Sparse Place',
    });

    const richPlace = createMockPlace({
      id: 'rich',
      name: 'Rich Place',
      description: 'Full description',
      coords: { lat: 1, lon: 1 },
      tags: ['tag1'],
      status: 'library',
    });

    expect(recommendMergeTarget([sparsePlace, richPlace])).toBe('rich');
    expect(recommendMergeTarget([richPlace, sparsePlace])).toBe('rich');
  });

  it('throws error for empty array', () => {
    expect(() => recommendMergeTarget([])).toThrow();
  });

  it('returns single place id if only one place', () => {
    const place = createMockPlace({ id: 'only' });
    expect(recommendMergeTarget([place])).toBe('only');
  });
});

describe('computeMergedPlace', () => {
  it('combines arrays from target and sources', () => {
    const target = createMockPlace({
      id: 'target',
      tags: ['tag1'],
      vibes: ['vibe1'],
    });

    const source = createMockPlace({
      id: 'source',
      tags: ['tag2', 'tag3'],
      vibes: ['vibe2'],
    });

    const merged = computeMergedPlace(target, [source]);

    expect(merged.tags).toHaveLength(3);
    expect(merged.tags).toContain('tag1');
    expect(merged.tags).toContain('tag2');
    expect(merged.tags).toContain('tag3');
    expect(merged.vibes).toHaveLength(2);
  });

  it('fills missing fields from sources', () => {
    const target = createMockPlace({
      id: 'target',
      description: null,
      coords: null,
    });

    const source = createMockPlace({
      id: 'source',
      description: 'Source description',
      coords: { lat: 1, lon: 2 },
    });

    const merged = computeMergedPlace(target, [source]);

    expect(merged.description).toBe('Source description');
    expect(merged.coords).toEqual({ lat: 1, lon: 2 });
  });

  it('preserves target fields when present', () => {
    const target = createMockPlace({
      id: 'target',
      description: 'Target description',
      coords: { lat: 10, lon: 20 },
    });

    const source = createMockPlace({
      id: 'source',
      description: 'Source description',
      coords: { lat: 1, lon: 2 },
    });

    const merged = computeMergedPlace(target, [source]);

    expect(merged.description).toBe('Target description');
    expect(merged.coords).toEqual({ lat: 10, lon: 20 });
  });

  it('concatenates different notes', () => {
    const target = createMockPlace({
      id: 'target',
      notes: 'Target notes',
    });

    const source = createMockPlace({
      id: 'source',
      notes: 'Source notes',
    });

    const merged = computeMergedPlace(target, [source]);

    expect(merged.notes).toContain('Target notes');
    expect(merged.notes).toContain('Source notes');
    expect(merged.notes).toContain('---');
  });

  it('uses higher confidence value', () => {
    const target = createMockPlace({
      id: 'target',
      confidence: 0.6,
    });

    const source = createMockPlace({
      id: 'source',
      confidence: 0.9,
    });

    const merged = computeMergedPlace(target, [source]);

    expect(merged.confidence).toBe(0.9);
  });
});
