import { optimizedBatchDetectDuplicates } from '../duplicate-optimization';
import {
  batchDetectDuplicatesUnoptimized,
  DEFAULT_DETECTION_CONFIG,
  duplicatePageBand,
} from '../duplicate-detection';
import type { Place } from '@/types/database';

function createMockPlace(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    userId: null,
    name: `Place ${id}`,
    kind: 'landmark',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4 + Math.random() * 0.1, lon: 2.1 + Math.random() * 0.1 },
    address: null,
    googlePlaceId: null,
    altNames: [],
    description: null,
    tags: [],
    vibes: [],
    ratingSelf: 0,
    notes: null,
    status: 'inbox',
    confidence: 0.9,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
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
    ...overrides
  };
}

describe('Duplicate Detection Performance Optimization', () => {
  describe('Benchmark: 1000 places', () => {
    it('should process 1000 places and return correct result count', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 1000; i++) {
        places.push(createMockPlace(`place-${i}`, {
          name: `Place ${i}`,
          city: `City ${i % 10}`,
          coords: { lat: 41.4 + (i % 100) * 0.01, lon: 2.1 + (i % 100) * 0.01 }
        }));
      }

      const startTime = performance.now();
      const results = await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);
      const endTime = performance.now();

      const duration = (endTime - startTime) / 1000;

      expect(results.size).toBe(1000);

      console.log(`✓ Optimized: 1000 places in ${duration.toFixed(3)}s`);
    }, 60000);

    it('should match unoptimized results for correctness', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 50; i++) {
        places.push(createMockPlace(`place-${i}`, {
          name: i < 25 ? `Duplicate ${i % 5}` : `Unique ${i}`,
          city: 'Barcelona',
          coords: { lat: 41.4 + (i % 5) * 0.001, lon: 2.1 + (i % 5) * 0.001 }
        }));
      }

      const optimizedResults = await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);
      const unoptimizedResults = await batchDetectDuplicatesUnoptimized(places, DEFAULT_DETECTION_CONFIG);

      expect(optimizedResults.size).toBe(unoptimizedResults.size);

      for (const [placeId, result] of optimizedResults) {
        const unoptimizedResult = unoptimizedResults.get(placeId);
        expect(unoptimizedResult).toBeDefined();
        expect(result.potentialDuplicates.length).toBe(unoptimizedResult!.potentialDuplicates.length);
      }

      console.log('✓ Optimized results match unoptimized (correctness verified)');
    });
  });

  describe('Edge Cases', () => {
    it('should handle all places in same city', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 100; i++) {
        places.push(createMockPlace(`place-${i}`, {
          city: 'Barcelona',
          coords: { lat: 41.4 + i * 0.001, lon: 2.1 + i * 0.001 }
        }));
      }

      const startTime = performance.now();
      const results = await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);
      const endTime = performance.now();

      expect(results.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000);

      console.log(`✓ Same city: ${((endTime - startTime) / 1000).toFixed(3)}s`);
    });

    it('should handle all places with similar names', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 100; i++) {
        places.push(createMockPlace(`place-${i}`, {
          name: 'Museum of Modern Art',
          city: `City ${i}`,
          coords: { lat: 40 + i * 0.1, lon: -70 + i * 0.1 }
        }));
      }

      const startTime = performance.now();
      const results = await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);
      const endTime = performance.now();

      expect(results.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000);

      console.log(`✓ Similar names: ${((endTime - startTime) / 1000).toFixed(3)}s`);
    });

    it('should handle places without coordinates', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 100; i++) {
        places.push(createMockPlace(`place-${i}`, {
          coords: null,
          city: `City ${i % 10}`
        }));
      }

      const results = await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);

      expect(results.size).toBe(100);
      console.log('✓ Places without coordinates handled correctly');
    });

    it('should handle empty place list', async () => {
      const results = await optimizedBatchDetectDuplicates([], DEFAULT_DETECTION_CONFIG);

      expect(results.size).toBe(0);
      console.log('✓ Empty list handled correctly');
    });

    it('should report progress correctly', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 10; i++) {
        places.push(createMockPlace(`place-${i}`));
      }

      const progressUpdates: number[] = [];
      await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG, (processed, total) => {
        progressUpdates.push(processed);
        expect(total).toBe(10);
      });

      expect(progressUpdates).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      console.log('✓ Progress reporting works correctly');
    });
  });

  describe('Performance Comparison', () => {
    it('should produce consistent results between optimized and unoptimized', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 200; i++) {
        places.push(createMockPlace(`place-${i}`, {
          city: `City ${i % 5}`,
          coords: { lat: 41 + i * 0.01, lon: 2 + i * 0.01 }
        }));
      }

      const optimizedResults = await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);
      const unoptimizedResults = await batchDetectDuplicatesUnoptimized(places, DEFAULT_DETECTION_CONFIG);

      // Both implementations should produce the same number of results
      expect(optimizedResults.size).toBe(unoptimizedResults.size);
      expect(optimizedResults.size).toBe(200);
    }, 60000);
  });
});

describe('exonym city candidate index', () => {
  it('scores Lisbon with Lisboa when there are no coordinates and no shared name prefix', async () => {
    const hidden = createMockPlace('hidden-beach', {
      name: 'X',
      altNames: ['Secret Beach'],
      kind: 'beach',
      city: 'Lisbon',
      country: 'Portugal',
      coords: null,
    });
    const beach = createMockPlace('secret-beach', {
      name: 'Secret Beach',
      kind: 'beach',
      city: 'Lisboa',
      country: 'Portugal',
      coords: null,
    });

    const beachResults = await optimizedBatchDetectDuplicates([hidden, beach], DEFAULT_DETECTION_CONFIG);
    const byAlt = beachResults.get('hidden-beach')!.potentialDuplicates.find((d) => d.place.id === 'secret-beach');
    const byPrimary = beachResults.get('secret-beach')!.potentialDuplicates.find((d) => d.place.id === 'hidden-beach');
    expect(byAlt).toBeDefined();
    expect(byPrimary).toBeDefined();
    expect(byAlt!.confidence).toBeCloseTo(1, 5);
    expect(duplicatePageBand(byAlt!.confidence, byAlt!.flags)).toBe('Main');
    expect(duplicatePageBand(byPrimary!.confidence, byPrimary!.flags)).toBe('Main');

    const cathedral = createMockPlace('cathedral', {
      name: 'Lisbon Cathedral',
      kind: 'landmark',
      city: 'Lisbon',
      country: 'Portugal',
      coords: null,
    });
    const se = createMockPlace('se', {
      name: 'Sé de Lisboa',
      kind: 'landmark',
      city: 'Lisboa',
      country: 'Portugal',
      coords: null,
    });
    const cathedralResults = await optimizedBatchDetectDuplicates([cathedral, se], DEFAULT_DETECTION_CONFIG);
    const fromLisbon = cathedralResults.get('cathedral')!.potentialDuplicates.find((d) => d.place.id === 'se');
    const fromLisboa = cathedralResults.get('se')!.potentialDuplicates.find((d) => d.place.id === 'cathedral');
    expect(fromLisbon).toBeDefined();
    expect(fromLisboa).toBeDefined();
    expect(fromLisbon!.confidence).toBeCloseTo(0.714, 2);
    expect(duplicatePageBand(fromLisbon!.confidence, fromLisbon!.flags)).toBe('Main');
    expect(duplicatePageBand(fromLisboa!.confidence, fromLisboa!.flags)).toBe('Main');
  });

  it('keeps blank cities in their own bucket, apart from a named city', async () => {
    const missing = createMockPlace('missing-city', {
      name: 'X',
      kind: 'beach',
      city: null,
      country: null,
      coords: null,
    });
    const whitespace = createMockPlace('whitespace-city', {
      name: 'Qwerty',
      kind: 'beach',
      city: '   ',
      country: null,
      coords: null,
    });
    const lisbon = createMockPlace('lisbon-only', {
      name: 'Zzxxyy',
      kind: 'beach',
      city: 'Lisbon',
      country: 'Portugal',
      coords: null,
    });

    const blankResults = await optimizedBatchDetectDuplicates([missing, whitespace], DEFAULT_DETECTION_CONFIG);
    expect(blankResults.get('missing-city')!.totalCandidates).toBe(1);
    expect(blankResults.get('whitespace-city')!.totalCandidates).toBe(1);
    expect(blankResults.get('missing-city')!.potentialDuplicates).toHaveLength(0);

    const separated = await optimizedBatchDetectDuplicates([missing, lisbon], DEFAULT_DETECTION_CONFIG);
    expect(separated.get('missing-city')!.totalCandidates).toBe(0);
    expect(separated.get('lisbon-only')!.totalCandidates).toBe(0);

    const secret = createMockPlace('secret', {
      name: 'Secret Beach',
      kind: 'beach',
      city: null,
      country: 'United States',
      coords: null,
    });
    const harris = createMockPlace('harris', {
      name: 'Harris Beach',
      kind: 'beach',
      city: null,
      country: 'United States',
      coords: null,
    });
    const recalled = await optimizedBatchDetectDuplicates([secret, harris], DEFAULT_DETECTION_CONFIG);
    const match = recalled.get('secret')!.potentialDuplicates.find((d) => d.place.id === 'harris');
    expect(match).toBeDefined();
    expect(match!.factors.cityMatch).toBe(false);
    expect(duplicatePageBand(match!.confidence, match!.flags)).toBe('Possible');
  });
});
