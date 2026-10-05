/**
 * The Library's filter, sort and export rules as pure functions, so the page
 * component only wires state to them and each rule can be tested on its own.
 * Client-safe: no database imports.
 */
import type { ExportScope, LibraryFilters as ExportFilters } from '@/types/export';
import type { GroupMode, LibraryItem, LibraryView } from './types';

export interface LibraryFilterState {
  search: string;
  /** Place types. A real multi-select: a place matches when its kind is any of these. */
  kinds: Set<string>;
  city: string;
  country: string;
  tags: Set<string>;
  vibes: Set<string>;
  rating: number;
  visitStatus: Set<string>;
  hasPhotosOnly: boolean;
}

export const EMPTY_FILTERS: LibraryFilterState = {
  search: '',
  kinds: new Set(),
  city: 'all',
  country: 'all',
  tags: new Set(),
  vibes: new Set(),
  rating: 0,
  visitStatus: new Set(),
  hasPhotosOnly: false,
};

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

function setParam(value: string | null): Set<string> {
  return new Set((value ?? '').split(',').filter(Boolean));
}

/** Reads the filters back from the URL. `kind` takes one value or a comma list. */
export function parseFilters(params: URLSearchParams): LibraryFilterState {
  const kinds = setParam(params.get('kind'));
  kinds.delete('all');
  return {
    search: params.get('search') ?? '',
    kinds,
    city: params.get('city') || 'all',
    country: params.get('country') || 'all',
    tags: setParam(params.get('tags')),
    vibes: setParam(params.get('vibes')),
    rating: Number.parseInt(params.get('rating') ?? '0', 10) || 0,
    visitStatus: setParam(params.get('visitStatus')),
    hasPhotosOnly: params.get('hasPhotosOnly') === 'true',
  };
}

export function parseView(value: string | null, fallback: LibraryView): LibraryView {
  return VIEWS.includes(value as LibraryView) ? (value as LibraryView) : fallback;
}

export function parseGroup(value: string | null): GroupMode {
  return GROUPS.includes(value as GroupMode) ? (value as GroupMode) : DEFAULT_GROUP;
}

/** The URL for a state. Defaults are left out so a plain /library stays plain. */
export function toSearchParams(
  f: LibraryFilterState,
  extra: { view: LibraryView; sort: string; group: GroupMode }
): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.kinds.size) p.set('kind', [...f.kinds].join(','));
  if (f.city !== 'all') p.set('city', f.city);
  if (f.country !== 'all') p.set('country', f.country);
  if (f.tags.size) p.set('tags', [...f.tags].join(','));
  if (f.vibes.size) p.set('vibes', [...f.vibes].join(','));
  if (f.rating > 0) p.set('rating', String(f.rating));
  if (f.visitStatus.size) p.set('visitStatus', [...f.visitStatus].join(','));
  if (f.hasPhotosOnly) p.set('hasPhotosOnly', 'true');
  if (extra.view !== 'grid') p.set('view', extra.view);
  if (extra.sort !== DEFAULT_SORT) p.set('sort', extra.sort);
  if (extra.group !== DEFAULT_GROUP) p.set('group', extra.group);
  return p;
}

/** Filters other than the search box and the shelf, for the "Filters (n)" badge. */
export function panelFilterCount(f: LibraryFilterState): number {
  return (
    f.kinds.size +
    f.vibes.size +
    f.tags.size +
    (f.rating > 0 ? 1 : 0) +
    (f.hasPhotosOnly ? 1 : 0) +
    (f.city !== 'all' ? 1 : 0) +
    (f.country !== 'all' ? 1 : 0)
  );
}

export function hasActiveFilters(f: LibraryFilterState): boolean {
  return Boolean(f.search.trim()) || f.visitStatus.size > 0 || panelFilterCount(f) > 0;
}

export type Shelf = 'all' | 'not_visited' | 'planned' | 'visited';

/** Which shelf the visit-status filter amounts to; null when it is a custom mix. */
export function shelfOf(f: LibraryFilterState): Shelf | null {
  if (f.visitStatus.size === 0) return 'all';
  if (f.visitStatus.size === 1) return [...f.visitStatus][0] as Shelf;
  return null;
}

/**
 * Applies every filter. `searchIds` is the fuzzy index's answer for `f.search`
 * (null when there is no search), kept outside so this stays pure.
 */
export function filterItems(items: LibraryItem[], f: LibraryFilterState, searchIds: Set<string> | null): LibraryItem[] {
  return items.filter((p) => {
    if (searchIds && !searchIds.has(p.id)) return false;
    if (f.kinds.size && !f.kinds.has(p.kind)) return false;
    if (f.city !== 'all' && p.city !== f.city) return false;
    if (f.country !== 'all' && p.country !== f.country) return false;
    if (f.tags.size && !p.tags.some((t) => f.tags.has(t))) return false;
    if (f.vibes.size && !p.vibes.some((v) => f.vibes.has(v))) return false;
    if (f.rating > 0 && p.ratingSelf < f.rating) return false;
    if (f.visitStatus.size && !f.visitStatus.has(p.visitStatus)) return false;
    if (f.hasPhotosOnly && p.photos.length === 0) return false;
    return true;
  });
}

const time = (s: string) => new Date(s).getTime();

export function sortItems(items: LibraryItem[], sort: string): LibraryItem[] {
  const list = [...items];
  switch (sort) {
    case 'date-oldest':
      return list.sort((a, b) => time(a.createdAt) - time(b.createdAt));
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
      return list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  }
}

/** The export route takes at most this many ids in a `selected` scope. */
export const EXPORT_SELECTED_MAX = 500;

/**
 * What to ask the export route for, so the file holds what the page shows.
 *
 * - Nothing filtered: the whole library (status pinned to `library`, so the
 *   Inbox and the Archive stay out of a Library export).
 * - Filtered: the exact places on screen, by id. The route's filter object can
 *   express neither visit status, "has a photo", several kinds nor fuzzy
 *   search, so sending ids is the only way to match the page.
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
  if (f.city !== 'all') filters.city = f.city;
  if (f.country !== 'all') filters.country = f.country;
  if (f.tags.size) filters.tags = [...f.tags];
  if (f.vibes.size) filters.vibes = [...f.vibes];
  if (f.rating > 0) filters.minRating = f.rating;
  const approximate = Boolean(filters.searchText) || f.kinds.size > 1 || f.visitStatus.size > 0 || f.hasPhotosOnly;
  return { scope: { type: 'library', filters }, approximate };
}
