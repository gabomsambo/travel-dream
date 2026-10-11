import {
  EMPTY_FILTERS,
  EXPORT_SELECTED_MAX,
  buildExportScope,
  canonicalQuery,
  describeFilters,
  facetCounts,
  filterItems,
  hasActiveFilters,
  isPlanningSoon,
  parseFilters,
  parseGroup,
  parseView,
  shelfOf,
  smartOf,
  sortItems,
  toSearchParams,
  withShelf,
  withSmart,
  type FilterContext,
  type LibraryFilterState,
} from '@/lib/library/filters';
import { item, photo } from '../helpers/library-items';

const f = (patch: Partial<LibraryFilterState>): LibraryFilterState => ({ ...EMPTY_FILTERS, ...patch });
const NOW = new Date('2026-10-11T12:00:00Z');
const ctx = (patch: Partial<FilterContext> = {}): FilterContext => ({
  searchIds: null,
  hearts: new Set(),
  collected: new Set(),
  now: NOW,
  ...patch,
});

const places = [
  item({ id: 'a', kind: 'landmark', photos: [photo], visitStatus: 'visited', ratingSelf: 5, tags: ['temples'], vibes: ['historic'] }),
  item({ id: 'b', kind: 'museum', photos: [], visitStatus: 'planned', ratingSelf: 3, city: 'Tokyo', plannedVisit: '2026-10-25' }),
  item({ id: 'c', kind: 'cafe', photos: [photo], visitStatus: 'not_visited', country: 'Italy', city: 'Rome', createdAt: '2026-10-01T00:00:00Z' }),
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('filterItems', () => {
  it('"With a photo" keeps only places with a photo; "Missing a photo" only those without', () => {
    expect(ids(filterItems(places, f({ photo: 'with' }), ctx()))).toEqual(['a', 'c']);
    expect(ids(filterItems(places, f({ photo: 'without' }), ctx()))).toEqual(['b']);
  });

  it('place types, countries and cities are real multi-selects: a second value widens, never clears', () => {
    expect(ids(filterItems(places, f({ kinds: new Set(['landmark']) }), ctx()))).toEqual(['a']);
    expect(ids(filterItems(places, f({ kinds: new Set(['landmark', 'museum']) }), ctx()))).toEqual(['a', 'b']);
    expect(ids(filterItems(places, f({ countries: new Set(['Italy', 'Japan']) }), ctx()))).toEqual(['a', 'b', 'c']);
    expect(ids(filterItems(places, f({ cities: new Set(['Tokyo', 'Rome']) }), ctx()))).toEqual(['b', 'c']);
    // Exonyms are one city (#63): Roma finds the place stored as Rome.
    expect(ids(filterItems(places, f({ cities: new Set(['Roma']) }), ctx()))).toEqual(['c']);
  });

  it('applies visit status, rating, tags, vibes and the search ids', () => {
    expect(ids(filterItems(places, f({ visitStatus: new Set(['planned', 'visited']) }), ctx()))).toEqual(['a', 'b']);
    expect(ids(filterItems(places, f({ rating: 4 }), ctx()))).toEqual(['a']);
    expect(ids(filterItems(places, f({ tags: new Set(['temples']) }), ctx()))).toEqual(['a']);
    expect(ids(filterItems(places, f({ vibes: new Set(['historic']) }), ctx()))).toEqual(['a']);
    expect(ids(filterItems(places, f({ search: 'x' }), ctx({ searchIds: new Set(['c']) })))).toEqual(['c']);
  });

  it('best month matches the months a place is good in, and year-round places in every month', () => {
    const seasonal = [
      item({ id: 'spring', bestTime: { months: [3, 4, 5], yearRound: false, times: [] } }),
      item({ id: 'any', bestTime: { months: [], yearRound: true, times: [] } }),
      item({ id: 'unknown' }),
    ];
    expect(ids(filterItems(seasonal, f({ months: new Set([4]) }), ctx()))).toEqual(['spring', 'any']);
    expect(ids(filterItems(seasonal, f({ months: new Set([10]) }), ctx()))).toEqual(['any']);
  });

  it('hearts, "no collection", "recently added" and "planning soon" read the context', () => {
    expect(ids(filterItems(places, f({ hearts: true }), ctx({ hearts: new Set(['c']) })))).toEqual(['c']);
    expect(ids(filterItems(places, f({ uncollected: true }), ctx({ collected: new Set(['a']) })))).toEqual(['b', 'c']);
    expect(ids(filterItems(places, f({ addedDays: 30 }), ctx()))).toEqual(['c']);
    expect(ids(filterItems(places, f({ soonWeeks: 2 }), ctx()))).toEqual(['b']);
  });
});

describe('planning soon', () => {
  const planned = (plannedVisit: string | null) => item({ id: 'p', visitStatus: 'planned', plannedVisit });

  it('counts today, and the last day of the window, but not yesterday or past it', () => {
    expect(isPlanningSoon(planned('2026-10-11'), 1, NOW)).toBe(true);
    expect(isPlanningSoon(planned('2026-10-18'), 1, NOW)).toBe(true);
    expect(isPlanningSoon(planned('2026-10-19'), 1, NOW)).toBe(false);
    expect(isPlanningSoon(planned('2026-10-10'), 1, NOW)).toBe(false);
  });

  it('needs a planned status and a date', () => {
    expect(isPlanningSoon(planned(null), 8, NOW)).toBe(false);
    expect(isPlanningSoon(item({ id: 'x', visitStatus: 'visited', plannedVisit: '2026-10-12' }), 8, NOW)).toBe(false);
  });
});

describe('facetCounts', () => {
  it('counts each value with every other filter applied, ignoring its own facet', () => {
    const counts = facetCounts(places, f({ kinds: new Set(['cafe']), photo: 'with' }), ctx(), 'kinds');
    // The kind facet ignores the kind filter but keeps "with a photo": the museum (no photo) drops out.
    expect(Object.fromEntries(counts)).toEqual({ landmark: 1, cafe: 1 });
    expect(Object.fromEntries(facetCounts(places, EMPTY_FILTERS, ctx(), 'countries'))).toEqual({ Japan: 2, Italy: 1 });
    const lisbon = [item({ id: 'l1', city: 'Lisboa', country: 'Portugal' }), item({ id: 'l2', city: 'Lisbon', country: 'Portugal' })];
    expect(Object.fromEntries(facetCounts(lisbon, EMPTY_FILTERS, ctx(), 'cities'))).toEqual({ Lisbon: 2 });
  });
});

describe('URL state', () => {
  it('reads a single kind and a comma list alike, and drops the old "all"', () => {
    expect([...parseFilters(new URLSearchParams('kind=landmark')).kinds]).toEqual(['landmark']);
    expect([...parseFilters(new URLSearchParams('kind=landmark,museum')).kinds]).toEqual(['landmark', 'museum']);
    expect(parseFilters(new URLSearchParams('kind=all')).kinds.size).toBe(0);
  });

  it('keeps build 1 links working: one country or city, "all", and hasPhotosOnly', () => {
    const old = parseFilters(new URLSearchParams('country=Japan&city=all&hasPhotosOnly=true'));
    expect([...old.countries]).toEqual(['Japan']);
    expect(old.cities.size).toBe(0);
    expect(old.photo).toBe('with');
  });

  it('round-trips every filter, leaving defaults out so a plain /library stays plain', () => {
    const state = f({
      search: 'ramen tokyo',
      kinds: new Set(['landmark', 'museum']),
      countries: new Set(['Japan', 'Korea, Republic of']),
      cities: new Set(['Kyoto']),
      months: new Set([10, 4]),
      visitStatus: new Set(['visited']),
      photo: 'without',
      hearts: true,
      soonWeeks: 4,
      addedDays: 30,
      uncollected: true,
      rating: 4,
    });
    const qs = toSearchParams(state, { view: 'journal', sort: 'name-az', group: 'city' });
    const back = parseFilters(qs);
    expect(back).toEqual(state);
    expect(qs.getAll('country')).toEqual(['Japan', 'Korea, Republic of']);
    expect(qs.get('view')).toBe('journal');
    expect(qs.get('group')).toBe('city');
    expect(toSearchParams(EMPTY_FILTERS, { view: 'grid', sort: 'date-newest', group: 'country' }).toString()).toBe('');
  });

  it('spells the same view one way, whatever order it was written in, and drops unknown keys', () => {
    expect(canonicalQuery('?tags=b,a&country=Spain&country=Italy&utm=x')).toBe('country=Italy&country=Spain&tags=a%2Cb');
    expect(canonicalQuery('group=country&view=grid&sort=date-newest')).toBe('');
    expect(canonicalQuery('rating=99&soon=-1')).toBe('');
  });

  it('falls back on unknown views and groupings', () => {
    expect(parseView('carousel', 'grid')).toBe('grid');
    expect(parseView('map', 'grid')).toBe('map');
    expect(parseGroup('planet')).toBe('country');
    expect(parseGroup('month')).toBe('month');
  });
});

describe('shelves', () => {
  it('maps the visit-status and hearts filters onto a shelf, or none for a custom mix', () => {
    expect(shelfOf(EMPTY_FILTERS)).toBe('all');
    expect(shelfOf(f({ visitStatus: new Set(['visited']) }))).toBe('visited');
    expect(shelfOf(f({ visitStatus: new Set(['visited', 'planned']) }))).toBeNull();
    expect(shelfOf(f({ hearts: true }))).toBe('hearts');
    expect(shelfOf(f({ hearts: true, visitStatus: new Set(['visited']) }))).toBeNull();
  });

  it('switching shelves swaps hearts and visit status, keeping everything else', () => {
    const start = f({ search: 'kyoto', hearts: true });
    expect(withShelf(start, 'planned')).toEqual(f({ search: 'kyoto', visitStatus: new Set(['planned']) }));
    expect(withShelf(f({ visitStatus: new Set(['planned']) }), 'hearts')).toEqual(f({ hearts: true }));
    expect(withShelf(start, 'all')).toEqual(f({ search: 'kyoto' }));
  });

  it('smart shelves are one at a time and toggle off, leaving the other filters alone', () => {
    const base = f({ countries: new Set(['Japan']) });
    const soon = withSmart(base, 'soon');
    expect(soon.soonWeeks).toBe(8);
    expect([...smartOf(soon)]).toEqual(['soon']);
    const photoless = withSmart(soon, 'nophoto');
    expect(photoless).toEqual(f({ countries: new Set(['Japan']), photo: 'without' }));
    expect(withSmart(photoless, 'nophoto')).toEqual(base);
    expect(withSmart(f({ photo: 'with' }), 'recent')).toEqual(f({ photo: 'with', addedDays: 30 }));
  });
});

describe('describeFilters', () => {
  it('says what is on, in a few words, for the no-matches line and a saved view name', () => {
    expect(describeFilters(f({ countries: new Set(['Japan']), tags: new Set(['ramen']), visitStatus: new Set(['planned']) }))).toEqual([
      'Japan',
      '#ramen',
      'Planned',
    ]);
    expect(describeFilters(EMPTY_FILTERS)).toEqual([]);
  });
});

describe('sortItems', () => {
  it('sorts by the same seven orders as before', () => {
    const list = [
      item({ id: 'b', name: 'Beta', createdAt: '2025-01-02T00:00:00Z', ratingSelf: 1, kind: 'museum' }),
      item({ id: 'a', name: 'Alpha', createdAt: '2025-01-03T00:00:00Z', ratingSelf: 4, kind: 'cafe' }),
      item({ id: 'c', name: 'Gamma', createdAt: '2025-01-01T00:00:00Z', ratingSelf: 2, kind: 'bar' }),
    ];
    expect(ids(sortItems(list, 'date-newest'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortItems(list, 'date-oldest'))).toEqual(['c', 'b', 'a']);
    expect(ids(sortItems(list, 'rating-high'))).toEqual(['a', 'c', 'b']);
    expect(ids(sortItems(list, 'rating-low'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortItems(list, 'name-az'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortItems(list, 'name-za'))).toEqual(['c', 'b', 'a']);
    expect(ids(sortItems(list, 'kind'))).toEqual(['c', 'a', 'b']);
  });
});

describe('buildExportScope', () => {
  it('exports the whole library — and only the library — when nothing is filtered', () => {
    expect(buildExportScope(EMPTY_FILTERS, ['a', 'b', 'c'])).toEqual({
      scope: { type: 'library', filters: { status: 'library' } },
      approximate: false,
    });
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('exports exactly what is shown when a visit-status or smart filter is on', () => {
    for (const filters of [f({ visitStatus: new Set(['visited']) }), f({ hearts: true }), f({ soonWeeks: 8 })]) {
      const { scope, approximate } = buildExportScope(filters, ['a']);
      expect(scope).toEqual({ type: 'selected', placeIds: ['a'] });
      expect(approximate).toBe(false);
    }
    // The visit status never travels as the export route's `status` field.
    expect(JSON.stringify(buildExportScope(f({ visitStatus: new Set(['visited']) }), ['a']).scope)).not.toContain('visited');
  });

  it('falls back to the filters the route understands past the id cap, and says so', () => {
    const many = Array.from({ length: EXPORT_SELECTED_MAX + 1 }, (_, i) => `p${i}`);
    const { scope, approximate } = buildExportScope(
      f({ kinds: new Set(['cafe']), countries: new Set(['Italy']), visitStatus: new Set(['planned']) }),
      many
    );
    expect(scope).toEqual({ type: 'library', filters: { status: 'library', kind: 'cafe', country: 'Italy' } });
    expect(approximate).toBe(true);
    expect(buildExportScope(f({ countries: new Set(['Italy', 'Spain']) }), many).approximate).toBe(true);
    expect(buildExportScope(f({ tags: new Set(['ramen']) }), many)).toEqual({
      scope: { type: 'library', filters: { status: 'library', tags: ['ramen'] } },
      approximate: false,
    });
  });
});
