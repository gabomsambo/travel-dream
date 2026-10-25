/**
 * The gallery as one flat list of rows (chapter header, a row of tiles, the
 * phone interlude), so a virtualizer can mount only the rows on screen. Pure
 * and client-safe. The sizes here mirror the grid in the gallery: 2 / 3 / 4
 * columns, and a shorter peek on phones.
 */
import { citiesMatch } from '@/lib/city-names';
import { citiesOf, type Chapter } from './chapters';
import type { GroupMode, LibraryItem } from './types';

export const DESKTOP_PEEK = 7;
export const MOBILE_PEEK = 5;
/** "No grouping" is one grid; it opens a page at a time, as it always has. */
export const PAGE = 48;

export type GalleryCell = { kind: 'tile'; item: LibraryItem } | { kind: 'more'; count: number };

export type GalleryRow =
  | {
      kind: 'header';
      key: string;
      chapter: Chapter;
      /** The city chip that is on, in a country chapter. */
      city: string | null;
    }
  | {
      kind: 'tiles';
      key: string;
      chapter: Chapter;
      cells: GalleryCell[];
      /** Position of this row's first cell among the chapter's cells, 1-based. */
      firstPos: number;
      /** Cells in the chapter's list, the "N more" tile included. */
      setSize: number;
      last: boolean;
    }
  | { kind: 'pager'; key: string; next: number; remaining: number }
  | { kind: 'interlude'; key: string };

export interface GalleryRowOptions {
  group: GroupMode;
  cols: number;
  peek: number;
  /** Chapter keys opened with "N more". */
  expanded: ReadonlySet<string>;
  /** The city chip chosen in a country chapter. */
  cityBy: ReadonlyMap<string, string | null>;
  /** Pages of PAGE places opened in the single "No grouping" chapter. */
  pages: number;
  /** A phone shows the trips interlude after the first chapter; larger screens have it elsewhere. */
  interlude: boolean;
}

/** The city chip that applies: only one that is still a choice in the chapter. */
export function activeCityOf(chapter: Chapter, chosen: string | null | undefined): string | null {
  if (!chosen) return null;
  const cities = citiesOf(chapter.items);
  return cities.length > 1 && cities.some((c) => c.city === chosen) ? chosen : null;
}

export function buildGalleryRows(chapters: Chapter[], o: GalleryRowOptions): GalleryRow[] {
  const rows: GalleryRow[] = [];
  const showCities = o.group === 'country';
  chapters.forEach((chapter, ci) => {
    const single = chapter.key === 'all';
    const city = showCities ? activeCityOf(chapter, o.cityBy.get(chapter.key)) : null;
    const items = city ? chapter.items.filter((p) => citiesMatch(p.city, city)) : chapter.items;
    const open = single || o.expanded.has(chapter.key);

    if (!single) rows.push({ kind: 'header', key: `h:${chapter.key}`, chapter, city });

    const shownItems = single ? items.slice(0, o.pages * PAGE) : open ? items : items.slice(0, o.peek);
    const cells: GalleryCell[] = shownItems.map((item) => ({ kind: 'tile', item }));
    if (!single && !open && items.length > o.peek) cells.push({ kind: 'more', count: items.length - o.peek });

    const paged = single && items.length > shownItems.length;
    for (let i = 0; i < cells.length; i += o.cols) {
      rows.push({
        kind: 'tiles',
        key: `t:${chapter.key}:${i}`,
        chapter,
        cells: cells.slice(i, i + o.cols),
        firstPos: i + 1,
        setSize: cells.length,
        // The "Show more" button closes a paged chapter, so its last row of tiles keeps the tight gap.
        last: i + o.cols >= cells.length && !paged,
      });
    }
    if (paged) {
      rows.push({ kind: 'pager', key: `p:${chapter.key}`, next: Math.min(PAGE, items.length - shownItems.length), remaining: items.length - shownItems.length });
    }
    if (ci === 0 && o.interlude) rows.push({ kind: 'interlude', key: 'interlude' });
  });
  return rows;
}

/** Index of each chapter's first row (its header; the single "all" chapter has none), for the index's jump. */
export function chapterRowIndex<R>(rows: R[], chapterOf: (row: R) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = chapterOf(row);
    if (key !== null && !map.has(key)) map.set(key, i);
  });
  return map;
}

/** The chapter a row belongs to, or null for rows that belong to none (the interlude). */
export function rowChapterKey(row: GalleryRow | undefined): string | null {
  return row && (row.kind === 'header' || row.kind === 'tiles') ? row.chapter.key : null;
}
