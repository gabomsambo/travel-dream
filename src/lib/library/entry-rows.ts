/**
 * The journal, the compact list and the map's side list as one flat list of rows
 * (chapter header, one row per place, "N more"), so a virtualizer can mount only
 * the rows on screen. Pure and client-safe. How many places a chapter opens with,
 * and what its "more" button opens, are the same as they were before the lists
 * were windowed: the journal and the list show a peek, the map shows everything.
 */
import { citiesMatch } from '@/lib/city-names';
import type { Chapter } from './chapters';
import { activeCityOf } from './gallery-rows';
import type { GroupMode, LibraryItem } from './types';

export type EntryView = 'journal' | 'list' | 'map';

/** Places a chapter opens with, and the page size of the single ungrouped chapter. */
const BASE_LIMIT: Record<EntryView, { chapter: number; single: number }> = {
  journal: { chapter: 6, single: 24 },
  list: { chapter: 40, single: 100 },
  map: { chapter: Infinity, single: Infinity },
};

export type EntryRow =
  | {
      kind: 'header';
      key: string;
      chapter: Chapter;
      /** The city chip that is on, in a country chapter. */
      city: string | null;
    }
  /** The list's column titles, once per chapter. */
  | { kind: 'columns'; key: string; chapter: Chapter }
  | {
      kind: 'entry';
      key: string;
      chapter: Chapter;
      item: LibraryItem;
      /** Position among the chapter's shown places, 1-based. */
      pos: number;
      setSize: number;
      last: boolean;
    }
  /** `open` is how many places the chapter shows once this is pressed. */
  | { kind: 'more'; key: string; chapter: Chapter; hidden: number; open: number }
  | { kind: 'interlude'; key: string };

export interface EntryRowOptions {
  view: EntryView;
  group: GroupMode;
  /** Places opened so far in a chapter; a chapter not in here has its base limit. */
  limits: ReadonlyMap<string, number>;
  /** The city chip chosen in a country chapter (journal only). */
  cityBy: ReadonlyMap<string, string | null>;
  /** List column titles (md+); false on phone so they are not counted in the table. */
  columns: boolean;
  /** A phone shows the trips interlude after the first chapter; larger screens have it elsewhere. */
  interlude: boolean;
}

const isSingle = (chapter: Chapter) => chapter.key === 'all';

function baseLimit(view: EntryView, chapter: Chapter): number {
  return isSingle(chapter) ? BASE_LIMIT[view].single : BASE_LIMIT[view].chapter;
}

/** What "more" opens: the next page of the single ungrouped chapter, or the rest of any other. */
function nextLimit(view: EntryView, chapter: Chapter, current: number, total: number): number {
  return isSingle(chapter) ? current + BASE_LIMIT[view].single : total;
}

export function buildEntryRows(chapters: Chapter[], o: EntryRowOptions): EntryRow[] {
  const rows: EntryRow[] = [];
  const showCities = o.group === 'country' && o.view === 'journal';
  chapters.forEach((chapter, ci) => {
    const single = isSingle(chapter);
    const city = showCities ? activeCityOf(chapter, o.cityBy.get(chapter.key)) : null;
    const items = city ? chapter.items.filter((p) => citiesMatch(p.city, city)) : chapter.items;
    const limit = o.limits.get(chapter.key) ?? baseLimit(o.view, chapter);
    const shown = items.slice(0, limit);
    const hidden = items.length - shown.length;

    if (!single) rows.push({ kind: 'header', key: `h:${chapter.key}`, chapter, city });
    if (o.view === 'list' && o.columns) rows.push({ kind: 'columns', key: `c:${chapter.key}`, chapter });
    shown.forEach((item, i) => {
      rows.push({ kind: 'entry', key: `e:${chapter.key}:${item.id}`, chapter, item, pos: i + 1, setSize: shown.length, last: i === shown.length - 1 && hidden === 0 });
    });
    if (hidden > 0) rows.push({ kind: 'more', key: `m:${chapter.key}`, chapter, hidden, open: nextLimit(o.view, chapter, limit, items.length) });
    if (ci === 0 && o.interlude) rows.push({ kind: 'interlude', key: 'interlude' });
  });
  return rows;
}

/** The chapter a row belongs to, or null for rows that belong to none (the interlude). */
export function entryChapterKey(row: EntryRow | undefined): string | null {
  return row && row.kind !== 'interlude' ? row.chapter.key : null;
}
