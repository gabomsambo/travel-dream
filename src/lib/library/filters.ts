/**
 * The Library's filter, sort and export rules as pure functions, so the page
 * component only wires state to them and each rule can be tested on its own.
 * Client-safe: no database imports.
 */
import type { ExportScope, LibraryFilters as ExportFilters } from '@/types/export';
import { cityGroupLabel, citiesMatch } from '@/lib/city-names';
import type { GroupMode, LibraryItem, LibraryView } from './types';

export type PhotoFilter = 'any' | 'with' | 'without';

export interface LibraryFilterState {
  search: string;
  /** Place types. A real multi-select: a place matches when its kind is any of these. */
  kinds: Set<string>;
  countries: Set<string>;
  cities: Set<string>;
  tags: Set<string>;
  vibes: Set<string>;
  /** Best month to go, 1–12. A place matches when any of them is a good month (or it's good all year). */
  months: Set<number>;
  rating: number;
  visitStatus: Set<string>;
  photo: PhotoFilter;
  /** Only hearted places (the Hearts shelf). */
  hearts: boolean;
  /** "Planning soon": planned, with a date from today up to this many weeks ahead. 0 = off. */
  soonWeeks: number;
  /** "Recently added": saved within this many days. 0 = off. */
  addedDays: number;
  /** "No collection": in none of the user's collections. */
  uncollected: boolean;
}

export const EMPTY_FILTERS: LibraryFilterState = {
  search: '',
  kinds: new Set(),
  countries: new Set(),
  cities: new Set(),
  tags: new Set(),
  vibes: new Set(),
  months: new Set(),
  rating: 0,
  visitStatus: new Set(),
  photo: 'any',
  hearts: false,
  soonWeeks: 0,
  addedDays: 0,
  uncollected: false,
};

/** What the rules need beyond the place itself. */
export interface FilterContext {
  /** The search index's answer for `search` (null when there is no search). */
  searchIds: Set<string> | null;
  hearts: Set<string>;
  /** Places that are in at least one collection. */
  collected: Set<string>;
  now: Date;
}

export const SORTS = [
  { value: 'date-newest', label: 'Recently saved' },
  { value: 'date-oldest', label: 'Oldest saved' },
  { value: 'rating-high', label: 'Rating (highest)' },
  { value: 'rating-low', label: 'Rating (lowest)' },
  { value: 'name-az', label: 'Name (A–Z)' },
  { value: 'name-za', label: 'Name (Z–A)' },
  { value: 'kind', label: 'Kind' },
] as const;

export const DEFAULT_SORT = 'date-newest';
export const DEFAULT_GROUP: GroupMode = 'country';
export const VIEWS: LibraryView[] = ['grid', 'journal', 'list', 'map'];
const GROUPS: GroupMode[] = ['country', 'city', 'collection', 'shelf', 'kind', 'month', 'saved', 'none'];

export const SOON_WEEK_OPTIONS = [2, 4, 8, 12, 26] as const;
export const DEFAULT_SOON_WEEKS = 8;
export const RECENT_DAYS = 30;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Every query parameter the Library reads; anything else in a saved view is dropped. */
export const QUERY_KEYS = [
  'search', 'kind', 'country', 'city', 'tags', 'vibes', 'month', 'rating', 'visitStatus', 'photo',
  'hasPhotosOnly', 'hearts', 'soon', 'added', 'uncollected', 'view', 'sort', 'group',
] as const;

function setParam(value: string | null): Set<string> {
  return new Set((value ?? '').split(',').map((v) => v.trim()).filter(Boolean));
}

function many(params: URLSearchParams, key: string): Set<string> {
  return new Set(params.getAll(key).map((v) => v.trim()).filter((v) => v && v !== 'all'));
}

function int(value: string | null, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : 0;
}

/**
 * Reads the filters back from the URL. Old links keep working: `kind` takes one
 * value or a comma list, `country`/`city` one value or several, and
 * `hasPhotosOnly=true` still means "with a photo".
 */
export function parseFilters(params: URLSearchParams): LibraryFilterState {
  const kinds = setParam(params.get('kind'));
  kinds.delete('all');
  const photo = params.get('photo');
  return {
    search: params.get('search') ?? '',
    kinds,
    countries: many(params, 'country'),
    cities: many(params, 'city'),
    tags: setParam(params.get('tags')),
    vibes: setParam(params.get('vibes')),
    months: new Set([...setParam(params.get('month'))].map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)),
    rating: int(params.get('rating'), 1, 5),
    visitStatus: new Set([...setParam(params.get('visitStatus'))].filter((s) => s === 'not_visited' || s === 'planned' || s === 'visited')),
    photo: photo === 'with' || photo === 'without' ? photo : params.get('hasPhotosOnly') === 'true' ? 'with' : 'any',
    hearts: params.get('hearts') === '1',
    soonWeeks: int(params.get('soon'), 1, 104),
    addedDays: int(params.get('added'), 1, 3650),
    uncollected: params.get('uncollected') === '1',
  };
}

export function parseView(value: string | null, fallback: LibraryView): LibraryView {
  return VIEWS.includes(value as LibraryView) ? (value as LibraryView) : fallback;
}

export function parseGroup(value: string | null): GroupMode {
  return GROUPS.includes(value as GroupMode) ? (value as GroupMode) : DEFAULT_GROUP;
}

const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));

/**
 * The URL for a state, in one fixed order with sorted values, so the same view
 * always spells the same query (saved views compare by it). Defaults are left
 * out so a plain /library stays plain.
 */
export function toSearchParams(
  f: LibraryFilterState,
  extra: { view: LibraryView; sort: string; group: GroupMode }
): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set('search', f.search);
  if (f.kinds.size) p.set('kind', sorted(f.kinds).join(','));
  for (const c of sorted(f.countries)) p.append('country', c);
  for (const c of sorted(f.cities)) p.append('city', c);
  if (f.tags.size) p.set('tags', sorted(f.tags).join(','));
  if (f.vibes.size) p.set('vibes', sorted(f.vibes).join(','));
  if (f.months.size) p.set('month', [...f.months].sort((a, b) => a - b).join(','));
  if (f.rating > 0) p.set('rating', String(f.rating));
  if (f.visitStatus.size) p.set('visitStatus', sorted(f.visitStatus).join(','));
  if (f.photo !== 'any') p.set('photo', f.photo);
  if (f.hearts) p.set('hearts', '1');
  if (f.soonWeeks > 0) p.set('soon', String(f.soonWeeks));
  if (f.addedDays > 0) p.set('added', String(f.addedDays));
  if (f.uncollected) p.set('uncollected', '1');
  if (extra.view !== 'grid') p.set('view', extra.view);
  if (extra.sort !== DEFAULT_SORT) p.set('sort', extra.sort);
  if (extra.group !== DEFAULT_GROUP) p.set('group', extra.group);
  return p;
}

/** A query string in its canonical spelling: unknown keys dropped, values sorted. */
export function canonicalQuery(query: string, fallbackView: LibraryView = 'grid'): string {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  return toSearchParams(parseFilters(params), {
    view: parseView(params.get('view'), fallbackView),
    sort: SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort')! : DEFAULT_SORT,
    group: parseGroup(params.get('group')),
  }).toString();
}

/** The filter-bar filters (not search, shelf or smart shelf), for the "Filters (n)" badge. */
export function panelFilterCount(f: LibraryFilterState): number {
  return (
    f.kinds.size +
    f.countries.size +
    f.cities.size +
    f.tags.size +
    f.vibes.size +
    f.months.size +
    (f.rating > 0 ? 1 : 0) +
    (f.photo !== 'any' ? 1 : 0)
  );
}

export function hasActiveFilters(f: LibraryFilterState): boolean {
  return (
    Boolean(f.search.trim()) ||
    f.visitStatus.size > 0 ||
    f.hearts ||
    f.soonWeeks > 0 ||
    f.addedDays > 0 ||
    f.uncollected ||
    panelFilterCount(f) > 0
  );
}

export type Shelf = 'all' | 'not_visited' | 'planned' | 'visited' | 'hearts';

/** Which shelf the visit-status and hearts filters amount to; null when it is a custom mix. */
export function shelfOf(f: LibraryFilterState): Shelf | null {
  if (f.hearts) return f.visitStatus.size === 0 ? 'hearts' : null;
  if (f.visitStatus.size === 0) return 'all';
  if (f.visitStatus.size === 1) return [...f.visitStatus][0] as Shelf;
  return null;
}

export function withShelf(f: LibraryFilterState, shelf: Shelf): LibraryFilterState {
  if (shelf === 'hearts') return { ...f, visitStatus: new Set(), hearts: true };
  return { ...f, hearts: false, visitStatus: shelf === 'all' ? new Set() : new Set([shelf]) };
}

export type SmartShelf = 'soon' | 'recent' | 'uncollected' | 'nophoto';

/** The smart shelves the current filters amount to (several, when combined from the filter bar). */
export function smartOf(f: LibraryFilterState): Set<SmartShelf> {
  const on = new Set<SmartShelf>();
  if (f.soonWeeks > 0) on.add('soon');
  if (f.addedDays > 0) on.add('recent');
  if (f.uncollected) on.add('uncollected');
  if (f.photo === 'without') on.add('nophoto');
  return on;
}

/**
 * Force a smart shelf on or off. Picking one on replaces any other smart shelf
 * (they are shelves, not stacking filters). `on: false` or a null shelf clears
 * smart fields. Search and the filter bar's other filters stay as they are.
 */
export function withSmart(f: LibraryFilterState, shelf: SmartShelf | null, on = true): LibraryFilterState {
  const off = { ...f, soonWeeks: 0, addedDays: 0, uncollected: false, photo: f.photo === 'without' ? 'any' : f.photo } as LibraryFilterState;
  if (!shelf || !on) return off;
  switch (shelf) {
    case 'soon':
      return { ...off, soonWeeks: f.soonWeeks || DEFAULT_SOON_WEEKS };
    case 'recent':
      return { ...off, addedDays: RECENT_DAYS };
    case 'uncollected':
      return { ...off, uncollected: true };
    case 'nophoto':
      return { ...off, photo: 'without' };
  }
}

/** Midnight UTC today: planned dates are date-only, so "from today" must not drop today's. */
function startOfDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function time(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

export function isPlanningSoon(p: LibraryItem, weeks: number, now: Date): boolean {
  if (p.visitStatus !== 'planned') return false;
  const t = time(p.plannedVisit);
  if (Number.isNaN(t)) return false;
  return t >= startOfDay(now) && t < startOfDay(now) + (weeks * 7 + 1) * 86_400_000;
}

export function isRecentlyAdded(p: LibraryItem, days: number, now: Date): boolean {
  const t = time(p.createdAt);
  return !Number.isNaN(t) && t >= now.getTime() - days * 86_400_000;
}

/** The facets the filter bar offers, each a popover with counts. */
export type Facet = 'countries' | 'cities' | 'kinds' | 'tags' | 'vibes' | 'months' | 'photo';

function inMonths(p: LibraryItem, months: Set<number>): boolean {
  return p.bestTime.yearRound || p.bestTime.months.some((m) => months.has(m));
}

/** Does `p` pass every filter, optionally ignoring one facet (for that facet's own counts)? */
export function matches(p: LibraryItem, f: LibraryFilterState, ctx: FilterContext, skip?: Facet): boolean {
  if (ctx.searchIds && !ctx.searchIds.has(p.id)) return false;
  if (skip !== 'kinds' && f.kinds.size && !f.kinds.has(p.kind)) return false;
  if (skip !== 'countries' && f.countries.size && !(p.country && f.countries.has(p.country.trim()))) return false;
  // Cities match under folding and exonyms (Lisboa is Lisbon), as the city chapters do.
  if (skip !== 'cities' && f.cities.size && ![...f.cities].some((c) => citiesMatch(p.city, c))) return false;
  if (skip !== 'tags' && f.tags.size && !p.tags.some((t) => f.tags.has(t))) return false;
  if (skip !== 'vibes' && f.vibes.size && !p.vibes.some((v) => f.vibes.has(v))) return false;
  if (skip !== 'months' && f.months.size && !inMonths(p, f.months)) return false;
  if (skip !== 'photo' && f.photo === 'with' && p.photos.length === 0) return false;
  if (skip !== 'photo' && f.photo === 'without' && p.photos.length > 0) return false;
  if (f.rating > 0 && p.ratingSelf < f.rating) return false;
  if (f.visitStatus.size && !f.visitStatus.has(p.visitStatus)) return false;
  if (f.hearts && !ctx.hearts.has(p.id)) return false;
  if (f.soonWeeks > 0 && !isPlanningSoon(p, f.soonWeeks, ctx.now)) return false;
  if (f.addedDays > 0 && !isRecentlyAdded(p, f.addedDays, ctx.now)) return false;
  if (f.uncollected && ctx.collected.has(p.id)) return false;
  return true;
}

export function filterItems(items: LibraryItem[], f: LibraryFilterState, ctx: FilterContext): LibraryItem[] {
  return items.filter((p) => matches(p, f, ctx));
}

function facetValues(p: LibraryItem, facet: Facet): string[] {
  switch (facet) {
    case 'countries':
      return p.country?.trim() ? [p.country.trim()] : [];
    case 'cities':
      return p.city?.trim() ? [cityGroupLabel(p.city)] : [];
    case 'kinds':
      return [p.kind];
    case 'tags':
      return p.tags;
    case 'vibes':
      return p.vibes;
    case 'months':
      return p.bestTime.yearRound ? Array.from({ length: 12 }, (_, i) => String(i + 1)) : p.bestTime.months.map(String);
    case 'photo':
      return [p.photos.length ? 'with' : 'without'];
  }
}

/**
 * How many places each value of a facet would show, with every other filter
 * applied — so a popover never invites a pick that empties the page unseen.
 */
export function facetCounts(items: LibraryItem[], f: LibraryFilterState, ctx: FilterContext, facet: Facet): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of items) {
    if (!matches(p, f, ctx, facet)) continue;
    for (const v of new Set(facetValues(p, facet))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

const SUGGESTION_FACETS = ['countries', 'cities', 'kinds', 'tags', 'vibes'] as const;
type SuggestionFacetKey = (typeof SUGGESTION_FACETS)[number];

/**
 * How many places Enter on a search suggestion would leave on the page.
 * Enter clears the search and adds the value to the shelf and filters already
 * on, so the count is that result. With nothing else narrowing the page, it is
 * the whole library.
 */
export function suggestionCounts(
  items: LibraryItem[],
  f: LibraryFilterState,
  ctx: FilterContext,
): Record<SuggestionFacetKey, Array<[string, number]>> {
  const noSearch: LibraryFilterState = { ...f, search: '' };
  const base: FilterContext = { ...ctx, searchIds: null };
  const out = {
    countries: [] as Array<[string, number]>,
    cities: [] as Array<[string, number]>,
    kinds: [] as Array<[string, number]>,
    tags: [] as Array<[string, number]>,
    vibes: [] as Array<[string, number]>,
  };
  for (const facet of SUGGESTION_FACETS) {
    const selected = noSearch[facet];
    const pool: LibraryItem[] = [];
    for (const p of items) {
      if (matches(p, noSearch, base, facet)) pool.push(p);
    }
    const counts = new Map<string, number>();
    if (selected.size === 0) {
      for (const p of pool) {
        for (const v of new Set(facetValues(p, facet))) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    } else {
      const values = new Set<string>();
      for (const p of pool) for (const v of facetValues(p, facet)) values.add(v);
      for (const value of values) {
        const next: LibraryFilterState = { ...noSearch, [facet]: new Set([...selected, value]) };
        let n = 0;
        for (const p of pool) if (matches(p, next, base)) n++;
        if (n > 0) counts.set(value, n);
      }
    }
    out[facet] = [...counts].sort((a, b) => b[1] - a[1]);
  }
  return out;
}

const ts = (s: string) => new Date(s).getTime();

export function sortItems(items: LibraryItem[], sort: string): LibraryItem[] {
  const list = [...items];
  switch (sort) {
    case 'date-oldest':
      return list.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    case 'rating-high':
      return list.sort((a, b) => b.ratingSelf - a.ratingSelf);
    case 'rating-low':
      return list.sort((a, b) => a.ratingSelf - b.ratingSelf);
    case 'name-az':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-za':
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case 'kind':
      return list.sort((a, b) => a.kind.localeCompare(b.kind));
    case 'date-newest':
    default:
      return list.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
  }
}

const STATUS_WORD: Record<string, string> = { not_visited: 'Dreaming', planned: 'Planned', visited: 'Been' };

/**
 * The state in a few words — "Japan · Ramen · Planned" — for the no-matches
 * line and a saved view's suggested name.
 */
export function describeFilters(f: LibraryFilterState, kindLabel: (k: string) => string = (k) => k): string[] {
  return [
    f.search.trim() && `“${f.search.trim()}”`,
    ...sorted(f.countries),
    ...sorted(f.cities),
    ...[...f.kinds].map(kindLabel),
    ...sorted(f.tags).map((t) => `#${t}`),
    ...sorted(f.vibes),
    f.months.size > 0 && [...f.months].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1].slice(0, 3)).join('/'),
    f.hearts && 'Hearts',
    ...[...f.visitStatus].map((s) => STATUS_WORD[s] ?? s),
    f.soonWeeks > 0 && `Planned in the next ${f.soonWeeks} weeks`,
    f.addedDays > 0 && `Added in the last ${f.addedDays} days`,
    f.uncollected && 'Not in a collection',
    f.photo === 'with' && 'With a photo',
    f.photo === 'without' && 'Missing a photo',
    f.rating > 0 && `${f.rating}★ and up`,
  ].filter((x): x is string => Boolean(x));
}

/** The export route takes at most this many ids in a `selected` scope. */
export const EXPORT_SELECTED_MAX = 500;

/**
 * What to ask the export route for, so the file holds what the page shows.
 *
 * - Nothing filtered: the whole library (status pinned to `library`, so the
 *   Inbox and the Archive stay out of a Library export).
 * - Filtered: the exact places on screen, by id. The route's filter object can
 *   express neither visit status, photos, hearts, smart shelves, several
 *   values per field nor fuzzy search, so sending ids is the only way to match
 *   the page.
 * - Filtered past the id cap: the filters the route understands, flagged
 *   `approximate` so the caller can say the file may differ.
 */
export function buildExportScope(
  f: LibraryFilterState,
  visibleIds: string[]
): { scope: ExportScope; approximate: boolean } {
  if (!hasActiveFilters(f)) return { scope: { type: 'library', filters: { status: 'library' } }, approximate: false };
  if (visibleIds.length <= EXPORT_SELECTED_MAX) return { scope: { type: 'selected', placeIds: visibleIds }, approximate: false };

  const filters: ExportFilters = { status: 'library' };
  if (f.search.trim()) filters.searchText = f.search.trim();
  if (f.kinds.size === 1) filters.kind = [...f.kinds][0];
  if (f.cities.size === 1) filters.city = [...f.cities][0];
  if (f.countries.size === 1) filters.country = [...f.countries][0];
  if (f.tags.size) filters.tags = [...f.tags];
  if (f.vibes.size) filters.vibes = [...f.vibes];
  if (f.rating > 0) filters.minRating = f.rating;
  const approximate =
    Boolean(filters.searchText) ||
    f.kinds.size > 1 ||
    f.cities.size > 1 ||
    f.countries.size > 1 ||
    f.months.size > 0 ||
    f.visitStatus.size > 0 ||
    f.photo !== 'any' ||
    f.hearts ||
    f.soonWeeks > 0 ||
    f.addedDays > 0 ||
    f.uncollected;
  return { scope: { type: 'library', filters }, approximate };
}
