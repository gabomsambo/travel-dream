/**
 * What the Library page needs to paint its first screen before the library's
 * index has arrived: the cover, the shelf counts, and the first few chapters
 * with their first tiles — the same chapters the client builds, from the same
 * pure functions, so the screen it swaps to is the one the server showed.
 *
 * Built on the server from the whole library and the URL, and sent in place of
 * the library. Pure and client-safe.
 */
import type { ExploreCollection } from '@/lib/explore/types';
import { buildChapters, chapterSummary, citiesOf, type Chapter } from './chapters';
import { coverPhotos, coverStats, type CoverPhoto, type CoverStats } from './cover';
import {
  DEFAULT_SORT,
  filterItems,
  hasActiveFilters,
  parseFilters,
  parseGroup,
  parseView,
  shelfOf,
  sortItems,
  type FilterContext,
  type Shelf,
} from './filters';
import { DESKTOP_PEEK } from './gallery-rows';
import { buildSearchIndex, searchLibrary } from './search';
import type { GroupMode, LibraryData, LibraryItem, LibraryView, SavedViewRow } from './types';

/** Libraries up to this size ride in the page whole: nothing to defer, so no index fetch. */
export const INLINE_LIMIT = 150;

/** Tiles on the first screen, across chapters. A phone shows a chapter and a half, a desktop about two rows. */
const FIRST_SCREEN_TILES = 16;
/** "No grouping" opens a screenful, not its first page of 48. */
const FIRST_SCREEN_FLAT = 12;

export interface FirstScreenChapter {
  key: string;
  title: string;
  eyebrow?: string;
  flag?: string;
  href?: string;
  hrefLabel?: string;
  /** Places in the chapter, of which `items` holds the first few. */
  count: number;
  summary: string;
  /** City chips, for a country chapter. */
  cities: Array<{ city: string; count: number }>;
  items: LibraryItem[];
}

/** The page, whole: for a library small enough that there is nothing to defer. */
export interface InlineSeed {
  mode: 'inline';
  data: LibraryData;
}

/** The first screen of a larger library, and the key of the index that holds the rest. */
export interface IndexedSeed {
  mode: 'indexed';
  userId: string;
  /** Names the index to fetch: `/api/library/index?v=<version>`. */
  version: string;
  view: LibraryView;
  group: GroupMode;
  total: number;
  /** How many places pass the URL's filters. */
  shown: number;
  stats: CoverStats;
  cover: CoverPhoto[];
  shelf: Shelf | null;
  shelfCounts: Record<Shelf, number>;
  /** The trips shelf sits above the chapters: there are collections, nothing is filtered, and it is not the map. */
  showTrips: boolean;
  /** Chapters the filters leave, of which `chapters` holds the first few. */
  chapterCount: number;
  chapters: FirstScreenChapter[];
  inboxCount: number;
  heartIds: string[];
  savedViews: SavedViewRow[];
}

export type LibrarySeed = InlineSeed | IndexedSeed;

const NO_HEARTS = new Set<string>();

function first(chapter: Chapter, group: GroupMode): FirstScreenChapter {
  const single = chapter.key === 'all';
  return {
    key: chapter.key,
    title: chapter.title,
    eyebrow: chapter.eyebrow,
    flag: chapter.flag,
    href: chapter.href,
    hrefLabel: chapter.hrefLabel,
    count: chapter.items.length,
    summary: chapterSummary(chapter.items, group !== 'city'),
    cities: group === 'country' ? citiesOf(chapter.items) : [],
    items: chapter.items.slice(0, single ? FIRST_SCREEN_FLAT : DESKTOP_PEEK),
  };
}

/** The URL the client reads its filters from, rebuilt from a page's `searchParams`. */
export function paramsFrom(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  return params;
}

export interface FirstScreenInput {
  userId: string;
  version: string;
  items: LibraryItem[];
  collections: ExploreCollection[];
  inboxCount: number;
  heartIds: string[];
  savedViews: SavedViewRow[];
  params: URLSearchParams;
  now: Date;
}

export function buildFirstScreen(input: FirstScreenInput): IndexedSeed {
  const { items, collections, params, now } = input;
  const filters = parseFilters(params);
  const view = parseView(params.get('view'), 'grid');
  const sort = params.get('sort') || DEFAULT_SORT;
  const group = parseGroup(params.get('group'));

  const hearts = new Set(input.heartIds);
  const hits = filters.search.trim() ? searchLibrary(buildSearchIndex(items), filters.search) : null;
  const ctx: FilterContext = {
    searchIds: hits ? new Set(hits.map((h) => h.id)) : null,
    hearts: filters.hearts ? hearts : NO_HEARTS,
    collected: new Set(collections.flatMap((c) => c.placeIds)),
    now,
  };
  const sorted = sortItems(filterItems(items, filters, ctx), sort);
  const chapters = buildChapters(sorted, group, collections, now);

  // Chapters until the first screen is full; the client has the rest.
  const out: FirstScreenChapter[] = [];
  let tiles = 0;
  for (const chapter of chapters) {
    if (tiles >= FIRST_SCREEN_TILES) break;
    const shown = first(chapter, group);
    out.push(shown);
    tiles += shown.items.length + (shown.count > shown.items.length && chapter.key !== 'all' ? 1 : 0);
  }

  const stats = coverStats(items);
  return {
    mode: 'indexed',
    userId: input.userId,
    version: input.version,
    view,
    group,
    total: items.length,
    shown: sorted.length,
    stats,
    cover: coverPhotos(items, 7),
    shelf: shelfOf(filters),
    shelfCounts: {
      all: stats.total,
      not_visited: stats.dreaming,
      planned: stats.planned,
      visited: stats.been,
      hearts: items.filter((p) => hearts.has(p.id)).length,
    },
    showTrips: collections.length > 0 && !hasActiveFilters(filters) && view !== 'map',
    chapterCount: chapters.length,
    chapters: out,
    inboxCount: input.inboxCount,
    heartIds: input.heartIds,
    savedViews: input.savedViews,
  };
}

/** The places the first screen holds, in the order it shows them. */
export function firstScreenItems(seed: IndexedSeed): LibraryItem[] {
  return seed.chapters.flatMap((c) => c.items);
}
