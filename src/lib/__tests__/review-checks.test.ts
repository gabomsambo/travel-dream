import { looksRight, reviewChecks } from '@/lib/review-checks';

const ready = {
  city: 'Coro',
  kind: 'landmark',
  confidence: 0.9,
  coords: { lat: 11.42, lon: -69.67 },
};

describe('reviewChecks', () => {
  it('lets a pinned, named place with a solid confidence skip Review', () => {
    expect(reviewChecks(ready)).toEqual([]);
    expect(looksRight(ready)).toBe(true);
  });

  it('marks a missing pin, the 0,0 fallback, no city, a shaky name, and a tip', () => {
    expect(reviewChecks({ ...ready, coords: null })).toEqual(['pin']);
    expect(reviewChecks({ ...ready, coords: { lat: 0, lon: 0 } })).toEqual(['pin']);
    expect(reviewChecks({ ...ready, city: '  ' })).toEqual(['city']);
    expect(reviewChecks({ ...ready, confidence: 0.55 })).toEqual(['name']);
    expect(reviewChecks({ ...ready, confidence: null })).toEqual(['name']);
    expect(reviewChecks({ ...ready, kind: 'tip' })).toEqual(['kind']);
  });

  it('can raise more than one check on the same place', () => {
    expect(reviewChecks({
      city: null,
      kind: 'tip',
      confidence: 0.2,
      coords: null,
    })).toEqual(['pin', 'city', 'name', 'kind']);
  });
});
