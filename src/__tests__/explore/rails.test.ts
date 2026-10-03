import { buildRails, captionFor, countriesIn, findRail, HOME_RAILS, homeRails, MIN_RAIL, orderRail } from '@/lib/explore/rails';
import { pickFeatured } from '@/lib/explore/featured';
import { flagFor, slugify } from '@/lib/explore/geo';
import { buildTripNudges } from '@/lib/explore/trip-nudges';
import { parseBestTime } from '@/lib/explore/best-time';
import type { ExplorePlace } from '@/lib/explore/types';

const NOW = new Date('2026-10-02T12:00:00Z');
let n = 0;

function place(over: Partial<ExplorePlace> & { bestTimeText?: string | null } = {}): ExplorePlace {
  const bestTimeText = over.bestTimeText ?? null;
  return {
    id: `plc_${++n}`, name: `Place ${n}`, kind: 'landmark', city: 'Lisbon', country: 'Portugal', description: null,
    notes: null, vibes: [], bestTimeText, bestTime: parseBestTime(bestTimeText, over.lat), recommendedBy: null,
    visitStatus: 'not_visited', priority: 0, ratingSelf: 0, priceLevel: null, createdAt: '2026-09-01 10:00:00',
    lat: null, lon: null, photos: ['https://example.com/p.jpg'], ...over,
  };
}

const many = (k: number, over: Partial<ExplorePlace> & { bestTimeText?: string }) => Array.from({ length: k }, () => place(over));

describe('buildRails', () => {
  it('builds "Good to visit in <this month>" from best_time, excluding visited places', () => {
    const october = many(4, { bestTimeText: 'September to November' });
    const visited = place({ bestTimeText: 'October', visitStatus: 'visited' });
    const rails = buildRails([...october, visited, ...many(3, { bestTimeText: 'year-round' })], NOW);
    const rail = rails.find((r) => r.id === 'month-10');
    expect(rail?.title).toBe('Good to visit in October');
    expect(rail?.places.map((p) => p.id).sort()).toEqual(october.map((p) => p.id).sort());
  });

  it('keeps next month free of places already in this month', () => {
    const both = many(4, { bestTimeText: 'October to November' });
    const novOnly = many(4, { bestTimeText: 'November' });
    const next = buildRails([...both, ...novOnly], NOW).find((r) => r.id === 'month-11');
    expect(next?.places.map((p) => p.id).sort()).toEqual(novOnly.map((p) => p.id).sort());
  });

  it('drops rails with fewer than MIN_RAIL places', () => {
    const rails = buildRails(many(MIN_RAIL - 1, { vibes: ['hidden-gem'] }), NOW);
    expect(rails.find((r) => r.id === 'hidden-gems')).toBeUndefined();
  });

  it('groups "Recommended by" case-insensitively and calls a first name a friend', () => {
    const recs = [...many(2, { recommendedBy: 'Sarah' }), ...many(2, { recommendedBy: 'sarah ' })];
    const rail = buildRails(recs, NOW).find((r) => r.id === 'rec-sarah');
    expect(rail?.places).toHaveLength(4);
    expect(rail?.eyebrow).toBe('From a friend');
  });

  it('puts only year-old unvisited saves in "Saved long ago", oldest first', () => {
    const old = [place({ createdAt: '2024-01-01 00:00:00' }), place({ createdAt: '2023-01-01 00:00:00' }),
      place({ createdAt: '2025-06-01 00:00:00' }), place({ createdAt: '2024-06-01 00:00:00' })];
    const fresh = place({ createdAt: '2026-08-01 00:00:00' });
    const rail = buildRails([...old, fresh], NOW).find((r) => r.id === 'forgotten');
    expect(rail?.places.map((p) => p.createdAt)).toEqual(['2023-01-01 00:00:00', '2024-01-01 00:00:00', '2024-06-01 00:00:00', '2025-06-01 00:00:00']);
  });

  it('is stable within a day', () => {
    const data = [...many(5, { vibes: ['romantic'] }), ...many(5, { vibes: ['iconic'] }), ...many(5, { kind: 'beach' })];
    expect(buildRails(data, NOW).map((r) => r.id)).toEqual(buildRails(data, new Date('2026-10-02T20:00:00Z')).map((r) => r.id));
  });

  it('captions explain the rail, not the location', () => {
    const p = place({ bestTimeText: 'Sunset, May to October', createdAt: '2024-01-01 00:00:00' });
    const rails = buildRails([p, ...many(3, { bestTimeText: 'October' })], NOW);
    expect(captionFor(rails.find((r) => r.id === 'month-10')!, p, NOW)).toBe('Sunset, May to October');
  });
});

describe('geo', () => {
  it('makes flags from country names and falls back to none', () => {
    expect(flagFor('Japan')).toBe('🇯🇵');
    expect(flagFor(' united states ')).toBe('🇺🇸');
    expect(flagFor('Atlantis')).toBe('');
  });

  it('slugifies accented names', () => {
    expect(slugify('Bún chả Hương Liên')).toBe('bun-cha-huong-lien');
  });
});

describe('homeRails', () => {
  const rails = buildRails(
    [
      ...many(5, { bestTimeText: 'October' }),
      ...many(4, { recommendedBy: 'Sarah' }), ...many(4, { recommendedBy: 'Mom' }), ...many(4, { recommendedBy: 'Kenji' }),
      ...many(4, { vibes: ['romantic'] }), ...many(4, { vibes: ['iconic'] }), ...many(4, { kind: 'beach' }),
      ...many(4, { vibes: ['hidden-gem'] }), ...many(4, { vibes: ['nightlife'] }), ...many(4, { kind: 'museum' }),
      ...many(4, { kind: 'restaurant', country: 'Japan' }), ...many(4, { kind: 'cafe', country: 'Italy' }),
      ...many(4, { createdAt: '2023-05-01 00:00:00' }),
    ],
    NOW
  );

  it('opens with the in-season rail and caps the page', () => {
    const home = homeRails(rails);
    expect(home[0].id).toBe('month-10');
    expect(home.length).toBeLessThanOrEqual(HOME_RAILS);
    expect(new Set(home.map((r) => r.id)).size).toBe(home.length);
  });

  it('mixes rail kinds instead of stacking one kind', () => {
    const home = homeRails(rails);
    const recIndexes = home.map((r, i) => (r.id.startsWith('rec-') ? i : -1)).filter((i) => i >= 0);
    expect(recIndexes.length).toBeGreaterThan(1);
    for (let i = 1; i < recIndexes.length; i++) expect(recIndexes[i] - recIndexes[i - 1]).toBeGreaterThan(1);
  });

  it('keeps every rail the library supports for Browse all', () => {
    expect(rails.filter((r) => r.id.startsWith('rec-'))).toHaveLength(3);
    expect(rails.filter((r) => r.id.startsWith('food-'))).toHaveLength(2);
  });
});

describe('findRail', () => {
  it('still resolves a "Because you saved" rail after the daily seed moves on', () => {
    const seed = place({ priority: 5, vibes: ['views', 'sunset', 'romantic'], city: 'Lisbon' });
    const alike = many(4, { vibes: ['views', 'sunset'], city: 'Porto' });
    const rail = findRail([seed, ...alike], `like-${seed.id}`, new Date('2027-03-15T12:00:00Z'));
    expect(rail?.places[0].id).toBe(seed.id);
    expect(rail?.places).toHaveLength(5);
  });

  it('returns null for an unknown rail', () => {
    expect(findRail(many(4, {}), 'nope', NOW)).toBeNull();
  });
});

describe('opened row helpers', () => {
  it('lists countries by count for the filter chips', () => {
    const list = [...many(3, { country: 'Japan' }), place({ country: 'Greece' }), place({ country: null })];
    expect(countriesIn(list)).toEqual([{ country: 'Japan', count: 3 }, { country: 'Greece', count: 1 }]);
  });

  it('orders newest first and shuffles to a permutation', () => {
    const list = [place({ createdAt: '2024-01-01 00:00:00' }), place({ createdAt: '2026-01-01 00:00:00' }), place({ createdAt: '2025-01-01 00:00:00' })];
    expect(orderRail(list, 'newest').map((p) => p.createdAt)).toEqual(['2026-01-01 00:00:00', '2025-01-01 00:00:00', '2024-01-01 00:00:00']);
    expect(orderRail(list, 'top')).toBe(list);
    expect(new Set(orderRail(list, 'shuffle', 3).map((p) => p.id))).toEqual(new Set(list.map((p) => p.id)));
  });
});

describe('pickFeatured', () => {
  it('picks one place per reason, one per country, and is stable for the day', () => {
    const data = [
      place({ country: 'Japan', bestTimeText: 'October', description: 'x' }),
      place({ country: 'Greece', createdAt: '2023-01-01 00:00:00' }),
      place({ country: 'Vietnam', priority: 5 }),
      place({ country: 'Peru', recommendedBy: 'Sarah' }),
      place({ country: 'Italy' }),
      place({ country: 'Japan', bestTimeText: 'October' }),
    ];
    const picks = pickFeatured(data, NOW);
    expect(picks).toHaveLength(5);
    expect(picks[0].reason).toBe('Best right now · October');
    expect(picks[1].reason).toMatch(/never visited$/);
    expect(picks[2].reason).toBe('One of your must-dos');
    expect(picks[3].reason).toBe('Recommended by Sarah');
    const countries = picks.map((p) => data.find((d) => d.id === p.placeId)!.country);
    expect(new Set(countries).size).toBe(5);
    expect(pickFeatured(data, new Date('2026-10-02T22:00:00Z'))).toEqual(picks);
  });

  it('prefers unvisited places with a photo', () => {
    const visited = place({ visitStatus: 'visited', country: 'Spain' });
    const noPhoto = place({ photos: [], country: 'France' });
    const picks = pickFeatured([visited, noPhoto, ...['A', 'B', 'C', 'D', 'E'].map((c) => place({ country: c }))], NOW);
    expect(picks.map((p) => p.placeId)).not.toContain(visited.id);
    expect(picks.map((p) => p.placeId)).not.toContain(noPhoto.id);
  });
});

describe('buildTripNudges', () => {
  it('suggests a trip once a city has enough unvisited places', () => {
    const tokyo = many(5, { country: 'Japan', city: 'Tokyo' });
    const [nudge] = buildTripNudges([...tokyo, place({ city: 'Kyoto' })], []);
    expect(nudge.city).toBe('Tokyo');
    expect(nudge.placeIds).toHaveLength(5);
    expect(nudge.existingCollection).toBeNull();
  });

  it('names the kinds of place saved there, most common first', () => {
    const lisbon = [...many(3, { kind: 'restaurant' }), ...many(2, { kind: 'viewpoint' })];
    expect(buildTripNudges(lisbon, [])[0].kinds).toEqual(['Eat & drink', 'See']);
  });

  it('points at an existing collection that already holds most of the city', () => {
    const tokyo = many(6, { country: 'Japan', city: 'Tokyo' });
    const col = { id: 'col_1', name: 'Tokyo 2027', placeIds: tokyo.slice(0, 3).map((p) => p.id) };
    expect(buildTripNudges(tokyo, [col])[0].existingCollection).toEqual({ id: 'col_1', name: 'Tokyo 2027' });
  });
});
