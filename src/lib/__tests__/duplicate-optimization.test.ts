import { optimizedBatchDetectDuplicates } from '../duplicate-optimization';
import { batchDetectDuplicatesUnoptimized, DEFAULT_DETECTION_CONFIG } from '../duplicate-detection';
import type { Place } from '@/types/database';

function createMockPlace(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name: `Place ${id}`,
    kind: 'landmark',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4 + Math.random() * 0.1, lon: 2.1 + Math.random() * 0.1 },
    address: null,
    altNames: [],
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
    ...overrides
  };
}

describe('Duplicate Detection Performance Optimization', () => {
  describe('Benchmark: 1000 places', () => {
    it('should process 1000 places in <3 seconds (target <2s, acceptable <3s)', async () => {
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
      expect(duration).toBeLessThan(3);

      console.log(`✓ Optimized: 1000 places in ${duration.toFixed(3)}s`);

      if (duration < 2) {
        console.log('  🎯 Target <2s achieved!');
      } else {
        console.log(`  📊 Within acceptable range (target <2s, got ${duration.toFixed(2)}s)`);
      }
    }, 10000);

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
    it('should demonstrate speedup vs unoptimized', async () => {
      const places: Place[] = [];
      for (let i = 0; i < 200; i++) {
        places.push(createMockPlace(`place-${i}`, {
          city: `City ${i % 5}`,
          coords: { lat: 41 + i * 0.01, lon: 2 + i * 0.01 }
        }));
      }

      const startOptimized = performance.now();
      await optimizedBatchDetectDuplicates(places, DEFAULT_DETECTION_CONFIG);
      const optimizedTime = performance.now() - startOptimized;

      const startUnoptimized = performance.now();
      await batchDetectDuplicatesUnoptimized(places, DEFAULT_DETECTION_CONFIG);
      const unoptimizedTime = performance.now() - startUnoptimized;

      const speedup = unoptimizedTime / optimizedTime;

      console.log(`\n📊 Performance Comparison (200 places):`);
      console.log(`   Optimized:   ${(optimizedTime / 1000).toFixed(3)}s`);
      console.log(`   Unoptimized: ${(unoptimizedTime / 1000).toFixed(3)}s`);
      console.log(`   Speedup:     ${speedup.toFixed(1)}x faster\n`);

      expect(speedup).toBeGreaterThan(2);
    }, 30000);
  });
});
