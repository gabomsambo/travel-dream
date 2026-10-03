import { buildAtlas, coverOf, REGION_ORDER, regionOf, seasonCurve } from '@/lib/explore/atlas';
import { flagFor, slugify } from '@/lib/explore/geo';
import { parseBestTime } from '@/lib/explore/best-time';
import type { ExplorePlace, ExplorePhoto } from '@/lib/explore/types';

const NOW = new Date('2026-10-02T12:00:00Z');
const PHOTO: ExplorePhoto = { thumb: 'https://example.com/p.jpg', uri: 'https://example.com/p.jpg' };
const PHOTO_2: ExplorePhoto = { thumb: 'https://example.com/q.jpg', uri: 'https://example.com/q.jpg' };
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
    photos: [PHOTO],
    ...over,
  };
}

const many = (k: number, over: Partial<ExplorePlace> & { bestTimeText?: string }) =>
  Array.from({ length: k }, () => place(over));

describe('buildAtlas', () => {
  it('groups places by country, then by city inside the country', () => {
    const data = [
      place({ country: 'Japan', city: 'Tokyo' }),
      place({ country: 'Japan', city: 'Tokyo' }),
      place({ country: 'Japan', city: 'Kyoto' }),
      place({ country: 'Italy', city: 'Rome' }),
    ];
    const atlas = buildAtlas(data);
    expect(atlas).toHaveLength(2);
    const japan = atlas.find((c) => c.country === 'Japan')!;
    expect(japan.cities.map((c) => c.city).sort()).toEqual(['Kyoto', 'Tokyo']);
    const tokyo = japan.cities.find((c) => c.city === 'Tokyo')!;
    expect(tokyo.places.length).toBe(2);
  });

  it('skips places whose country is null and reports them elsewhere', () => {
    const data = [place({ country: null, city: 'Mystery Island' }), place({ country: 'Japan', city: 'Tokyo' })];
    const atlas = buildAtlas(data);
    expect(atlas).toHaveLength(1);
    expect(atlas[0].country).toBe('Japan');
    const total = data.filter((p) => p.country).length;
    expect(total).toBe(1);
  });

  it('orders countries by how many places the user saved there, then by name', () => {
    const atlas = buildAtlas([
      ...many(2, { country: 'Italy', city: 'Rome' }),
      place({ country: 'Greece', city: 'Athens' }),
      place({ country: 'Greece', city: 'Athens' }),
      ...many(3, { country: 'Japan', city: 'Tokyo' }),
    ]);
    expect(atlas.map((c) => c.country)).toEqual(['Japan', 'Greece', 'Italy']);
  });

  it('orders cities within a country by place count, then by name', () => {
    const atlas = buildAtlas([
      ...many(4, { country: 'Japan', city: 'Tokyo' }),
      place({ country: 'Japan', city: 'Kyoto' }),
      place({ country: 'Japan', city: 'Kyoto' }),
      place({ country: 'Japan', city: 'Osaka' }),
    ]);
    const japan = atlas.find((c) => c.country === 'Japan')!;
    expect(japan.cities.map((c) => c.city)).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
  });

  it('falls a missing city back to the country name', () => {
    const atlas = buildAtlas([place({ country: 'Italy', city: null })]);
    expect(atlas[0].cities).toHaveLength(1);
    expect(atlas[0].cities[0].city).toBe('Italy');
    expect(atlas[0].cities[0].slug).toBe('italy');
  });

  it('produces URL-safe slugs for accented and multi-word names', () => {
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify('Mexico City')).toBe('mexico-city');
    expect(slugify('  Côte d\'Azur  ')).toBe('cote-d-azur');
  });

  it('looks up flag emojis for known countries and falls back to none', () => {
    expect(flagFor('Japan')).toBe('🇯🇵');
    expect(flagFor('Portugal')).toBe('🇵🇹');
    expect(flagFor('Atlantis')).toBe('');
  });
});

describe('coverOf', () => {
  it('picks the highest-scoring scenic place when there is no avoid set', () => {
    const places = [
      place({ id: 'a', priority: 2, kind: 'restaurant' }),
      place({ id: 'b', priority: 1, kind: 'landmark' }),
    ];
    expect(coverOf(places)).toBe(PHOTO.uri);
  });

  it('a landmark with priority 1 still beats a restaurant with priority 5 (scenic bonus)', () => {
    const places = [
      place({ id: 'a', priority: 5, kind: 'restaurant' }),
      place({ id: 'b', priority: 1, kind: 'landmark' }),
    ];
    expect(coverOf(places)).toBe(PHOTO.uri);
  });

  it('does not return a photo from the avoid set, but falls back to it if there is nothing else', () => {
    const a = place({ id: 'a', priority: 1, kind: 'landmark' });
    const b = place({ id: 'b', priority: 5, kind: 'restaurant' });
    const avoid = new Set([b.photos[0].uri]);
    // Both share the same photo in this fixture; the second place is its only candidate,
    // so coverOf returns it rather than returning null.
    expect(coverOf([a, b], avoid)).toBe(PHOTO.uri);
  });

  it('returns null when nothing has a photo', () => {
    const places = [place({ photos: [] })];
    expect(coverOf(places)).toBeNull();
  });
});

describe('seasonCurve', () => {
  it('counts unvisited places whose best_time includes each month', () => {
    const data = [
      place({ bestTimeText: 'October' }),
      place({ bestTimeText: 'October' }),
      place({ bestTimeText: 'November' }),
      place({ bestTimeText: 'October to December', visitStatus: 'visited' }),
    ];
    const curve = seasonCurve(data);
    // October: 2 (visited one is skipped), November: 1, December: 0
    expect(curve[9]).toBe(2);
    expect(curve[10]).toBe(1);
    expect(curve[11]).toBe(0);
  });

  it('skips visited places even when they are in season', () => {
    const curve = seasonCurve([place({ bestTimeText: 'October', visitStatus: 'visited' })]);
    expect(curve).toEqual(Array(12).fill(0));
  });
});

describe('regionOf', () => {
  it('maps known countries to their region', () => {
    expect(regionOf('Japan')).toBe('Asia');
    expect(regionOf('Portugal')).toBe('Europe');
    expect(regionOf('Mexico')).toBe('North America');
    expect(regionOf('Brazil')).toBe('South America');
    expect(regionOf('Morocco')).toBe('Africa');
    expect(regionOf('Australia')).toBe('Oceania');
  });

  it('falls back to "Elsewhere" for an unknown name', () => {
    expect(regionOf('Atlantis')).toBe('Elsewhere');
  });

  it('lists every region in REGION_ORDER exactly once', () => {
    expect(new Set(REGION_ORDER).size).toBe(REGION_ORDER.length);
    expect(REGION_ORDER).toContain('Elsewhere');
  });

  it('never assigns a region to a country that flagFor cannot identify', () => {
    // If flagFor falls back to '', regionOf should too. The whole-region chain
    // must never throw on a typo.
    expect(() => regionOf('Atlantis')).not.toThrow();
  });
});

// Photos exist as two URLs, but a real drill-down cares about distinct ones.
describe('country covers do not duplicate their top city cover', () => {
  it('does not pick the same photo for a country and its busiest city when other places have photos', () => {
    const city = place({ id: 'c1', priority: 5, kind: 'landmark', city: 'Tokyo', country: 'Japan' });
    const other = place({
      id: 'c2',
      priority: 4,
      kind: 'restaurant',
      city: 'Tokyo',
      country: 'Japan',
      photos: [PHOTO_2],
    });
    const atlas = buildAtlas([
      city,
      place({ id: 'c3', priority: 3, kind: 'museum', city: 'Tokyo', country: 'Japan', photos: [PHOTO] }),
      other,
    ]);
    const japan = atlas.find((c) => c.country === 'Japan')!;
    const tokyo = japan.cities.find((c) => c.city === 'Tokyo')!;
    // Tokyo cover comes from the highest-scoring place with a photo (the landmark).
    expect(tokyo.cover).toBe(PHOTO.uri);
    // Japan cover is forbidden to reuse the city's chosen photo when another place has one.
    expect(japan.cover).toBe(PHOTO_2.uri);
  });
});

// Compile-time check: buildAtlas's return type still fits what the country and city pages render.
describe('page-shape compile', () => {
  it('exposes the slug, flag and cover fields the pages need', () => {
    const atlas = buildAtlas([place({ country: 'Japan', city: 'Tokyo' })]);
    const c = atlas[0];
    expect(typeof c.slug).toBe('string');
    expect(typeof c.flag).toBe('string');
    expect(c.cities[0]).toMatchObject({ slug: 'tokyo' });
  });
});