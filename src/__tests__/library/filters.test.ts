import {
  EMPTY_FILTERS,
  EXPORT_SELECTED_MAX,
  buildExportScope,
  filterItems,
  hasActiveFilters,
  parseFilters,
  parseGroup,
  parseView,
  shelfOf,
  sortItems,
  toSearchParams,
  type LibraryFilterState,
} from '@/lib/library/filters';
import { item, photo } from '../helpers/library-items';

const f = (patch: Partial<LibraryFilterState>): LibraryFilterState => ({ ...EMPTY_FILTERS, ...patch });

const places = [
  item({ id: 'a', kind: 'landmark', photos: [photo], visitStatus: 'visited', ratingSelf: 5, tags: ['temples'], vibes: ['historic'] }),
  item({ id: 'b', kind: 'museum', photos: [], visitStatus: 'planned', ratingSelf: 3, city: 'Tokyo' }),
  item({ id: 'c', kind: 'cafe', photos: [photo], visitStatus: 'not_visited', country: 'Italy', city: 'Rome' }),
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('filterItems', () => {
  it('"Has a photo" keeps only places with a photo (it used to filter nothing)', () => {
    expect(ids(filterItems(places, f({ hasPhotosOnly: true }), null))).toEqual(['a', 'c']);
  });

  it('place types are a real multi-select: a second kind widens, never clears', () => {
    expect(ids(filterItems(places, f({ kinds: new Set(['landmark']) }), null))).toEqual(['a']);
    expect(ids(filterItems(places, f({ kinds: new Set(['landmark', 'museum']) }), null))).toEqual(['a', 'b']);
  });

  it('applies visit status, rating, place, tags, vibes and the search ids', () => {
    expect(ids(filterItems(places, f({ visitStatus: new Set(['planned', 'visited']) }), null))).toEqual(['a', 'b']);
    expect(ids(filterItems(places, f({ rating: 4 }), null))).toEqual(['a']);
    expect(ids(filterItems(places, f({ country: 'Italy' }), null))).toEqual(['c']);
    expect(ids(filterItems(places, f({ city: 'Tokyo' }), null))).toEqual(['b']);
    expect(ids(filterItems(places, f({ tags: new Set(['temples']) }), null))).toEqual(['a']);
    expect(ids(filterItems(places, f({ vibes: new Set(['historic']) }), null))).toEqual(['a']);
    expect(ids(filterItems(places, f({ search: 'x' }), new Set(['c'])))).toEqual(['c']);
  });
});

describe('URL state', () => {
  it('reads a single kind and a comma list alike, and drops the old "all"', () => {
    expect([...parseFilters(new URLSearchParams('kind=landmark')).kinds]).toEqual(['landmark']);
    expect([...parseFilters(new URLSearchParams('kind=landmark,museum')).kinds]).toEqual(['landmark', 'museum']);
    expect(parseFilters(new URLSearchParams('kind=all')).kinds.size).toBe(0);
  });

  it('round-trips, leaving defaults out so a plain /library stays plain', () => {
    const state = f({ kinds: new Set(['landmark', 'museum']), visitStatus: new Set(['visited']), hasPhotosOnly: true, rating: 4 });
    const qs = toSearchParams(state, { view: 'journal', sort: 'name-az', group: 'city' });
    const back = parseFilters(qs);
    expect([...back.kinds]).toEqual(['landmark', 'museum']);
    expect(back.hasPhotosOnly).toBe(true);
    expect(back.rating).toBe(4);
    expect(qs.get('view')).toBe('journal');
    expect(qs.get('group')).toBe('city');
    expect(toSearchParams(EMPTY_FILTERS, { view: 'grid', sort: 'date-newest', group: 'country' }).toString()).toBe('');
  });

  it('falls back on unknown views and groupings', () => {
    expect(parseView('carousel', 'grid')).toBe('grid');
    expect(parseView('map', 'grid')).toBe('map');
    expect(parseGroup('planet')).toBe('country');
    expect(parseGroup('month')).toBe('month');
  });
});

describe('shelves', () => {
  it('maps the visit-status filter onto a shelf, or none for a custom mix', () => {
    expect(shelfOf(EMPTY_FILTERS)).toBe('all');
    expect(shelfOf(f({ visitStatus: new Set(['visited']) }))).toBe('visited');
    expect(shelfOf(f({ visitStatus: new Set(['visited', 'planned']) }))).toBeNull();
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

  it('exports exactly what is shown when a visit-status filter is on (it used to fail validation)', () => {
    const { scope, approximate } = buildExportScope(f({ visitStatus: new Set(['visited']) }), ['a']);
    expect(scope).toEqual({ type: 'selected', placeIds: ['a'] });
    expect(approximate).toBe(false);
    // The visit status never travels as the export route's `status` field.
    expect(JSON.stringify(scope)).not.toContain('visited');
  });

  it('falls back to the filters the route understands past the id cap, and says so', () => {
    const many = Array.from({ length: EXPORT_SELECTED_MAX + 1 }, (_, i) => `p${i}`);
    const { scope, approximate } = buildExportScope(f({ kinds: new Set(['cafe']), country: 'Italy', visitStatus: new Set(['planned']) }), many);
    expect(scope).toEqual({ type: 'library', filters: { status: 'library', kind: 'cafe', country: 'Italy' } });
    expect(approximate).toBe(true);
  });
});
