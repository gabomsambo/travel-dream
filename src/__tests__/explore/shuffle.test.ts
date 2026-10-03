import { buildRails } from '@/lib/explore/rails';
import { shufflePool, weightedShuffle } from '@/lib/explore/shuffle';
import { parseBestTime } from '@/lib/explore/best-time';
import type { ExplorePlace } from '@/lib/explore/types';

const NOW = new Date('2026-10-02T12:00:00Z');
let n = 0;

function place(over: Partial<ExplorePlace> & { bestTimeText?: string | null } = {}): ExplorePlace {
  const bestTimeText = over.bestTimeText ?? null;
  return {
    id: `plc_${++n}`,
    name: `Place ${n}`,
    kind: 'landmark',
    city: 'Lisbon',
    country: 'Portugal',
    description: null,
    notes: null,
    vibes: [],
    bestTimeText,
    bestTime: parseBestTime(bestTimeText, over.lat),
    recommendedBy: null,
    visitStatus: 'not_visited',
    priority: 0,
    ratingSelf: 0,
    priceLevel: null,
    createdAt: '2026-09-01 10:00:00',
    lat: null,
    lon: null,
    photos: [{ uri: 'https://example.com/p.jpg', thumb: 'https://example.com/p-t.jpg' }],
    ...over,
  };
}

const many = (k: number, over: Partial<ExplorePlace> & { bestTimeText?: string } = {}) =>
  Array.from({ length: k }, () => place(over));

describe('shufflePool', () => {
  it('scopes to a rail id', () => {
    const pool = many(6, { bestTimeText: 'September to November' });
    const rails = buildRails(pool, NOW);
    const rail = rails.find((r) => r.id.startsWith('month-'));
    expect(rail).toBeDefined();
    const scoped = shufflePool(pool, { rail: rail!.id }, NOW)!;
    expect(scoped.pool.map((p) => p.id).sort()).toEqual(rail!.places.map((p) => p.id).sort());
    expect(scoped.backHref).toBe(`/explore/r/${rail!.id}`);
  });

  it('scopes to country and city slugs', () => {
    const lisbon = place({ country: 'Portugal', city: 'Lisbon' });
    const tokyo = place({ country: 'Japan', city: 'Tokyo' });
    const scoped = shufflePool([lisbon, tokyo], { country: 'portugal', city: 'lisbon' }, NOW)!;
    expect(scoped.pool).toEqual([lisbon]);
    expect(scoped.title).toBe('Lisbon');
  });

  it('scopes a city slug to the same places the atlas files under it, including cityless saves', () => {
    const kyoto = place({ country: 'Japan', city: 'Kyoto' });
    const noCity = place({ country: 'Japan', city: null });
    const blankCity = place({ country: ' Japan ', city: '   ' });
    const scoped = shufflePool([kyoto, noCity, blankCity], { country: 'japan', city: 'japan' }, NOW)!;
    expect(scoped.pool.map((p) => p.id).sort()).toEqual([noCity.id, blankCity.id].sort());
    expect(scoped.title).toBe('Japan');
    expect(scoped.backHref).toBe('/explore/atlas/japan/japan');
  });

  it('scopes to a country slug only', () => {
    const lisbon = place({ country: 'Portugal', city: 'Lisbon' });
    const porto = place({ country: 'Portugal', city: 'Porto' });
    const tokyo = place({ country: 'Japan', city: 'Tokyo' });
    const scoped = shufflePool([lisbon, porto, tokyo], { country: 'portugal' }, NOW)!;
    expect(scoped.pool.map((p) => p.id).sort()).toEqual([lisbon.id, porto.id].sort());
    expect(scoped.title).toBe('Portugal');
    expect(scoped.backHref).toBe('/explore/atlas/portugal');
  });

  it('defaults to everything', () => {
    const pool = many(3);
    const scoped = shufflePool(pool, {}, NOW)!;
    expect(scoped.pool).toHaveLength(3);
    expect(scoped.title).toBe('Everything');
    expect(scoped.backHref).toBe('/explore');
  });

  it('resolves a like-rail even after the daily seed moved on', () => {
    const seed = place({ name: 'Seed', vibes: ['beach', 'sunset'], kind: 'beach', priority: 0, city: 'Lisbon' });
    const alike = many(4, { vibes: ['beach', 'sunset'], kind: 'beach', city: 'Faro' });
    const all = [seed, ...alike];
    const scoped = shufflePool(all, { rail: `like-${seed.id}` }, NOW);
    expect(scoped).not.toBeNull();
    expect(scoped!.title).toBe(`Because you saved ${seed.name}`);
    expect(scoped!.backHref).toBe(`/explore/r/like-${seed.id}`);
    expect(scoped!.pool.map((p) => p.id).sort()).toEqual(all.map((p) => p.id).sort());
  });

  it('returns null for an unresolvable rail id', () => {
    expect(shufflePool(many(4, {}), { rail: 'nope' }, NOW)).toBeNull();
  });
});

describe('weightedShuffle', () => {
  it('returns every place exactly once', () => {
    const pool = many(20, {});
    const out = weightedShuffle(pool, NOW);
    expect(new Set(out.map((p) => p.id))).toEqual(new Set(pool.map((p) => p.id)));
  });

  it('surfaces old unvisited saves ahead of fresh visited ones on average', () => {
    const old = place({ createdAt: '2023-01-01 00:00:00' });
    const fresh = place({ createdAt: '2026-09-30 00:00:00', visitStatus: 'visited', photos: [] });
    let oldFirst = 0;
    for (let i = 0; i < 400; i++) if (weightedShuffle([fresh, old], NOW)[0].id === old.id) oldFirst++;
    expect(oldFirst).toBeGreaterThan(300);
  });
});
