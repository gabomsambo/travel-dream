import { buildChapters } from '@/lib/library/chapters';
import {
  DESKTOP_PEEK,
  MOBILE_PEEK,
  PAGE,
  activeCityOf,
  buildGalleryRows,
  chapterRowIndex,
  rowChapterKey,
  type GalleryRow,
  type GalleryRowOptions,
} from '@/lib/library/gallery-rows';
import type { GroupMode, LibraryItem } from '@/lib/library/types';
import { item } from '../helpers/library-items';

const NOW = new Date('2026-10-05T12:00:00Z');
const NONE: GalleryRowOptions = {
  group: 'country',
  cols: 4,
  peek: DESKTOP_PEEK,
  expanded: new Set(),
  cityBy: new Map(),
  pages: 1,
  interlude: false,
};
const opts = (o: Partial<GalleryRowOptions> = {}): GalleryRowOptions => ({ ...NONE, ...o });

const places = (n: number, over: (i: number) => Partial<LibraryItem> = () => ({})) =>
  Array.from({ length: n }, (_, i) => item({ id: `p${i}`, ...over(i) }));
const rowsFor = (items: LibraryItem[], group: GroupMode, o: Partial<GalleryRowOptions> = {}) =>
  buildGalleryRows(buildChapters(items, group, [], NOW), opts({ group, ...o }));
const kinds = (rows: GalleryRow[]) => rows.map((r) => r.kind);
const tilesIn = (rows: GalleryRow[]) =>
  rows.flatMap((r) => (r.kind === 'tiles' ? r.cells.flatMap((c) => (c.kind === 'tile' ? [c.item.id] : [])) : []));

describe('buildGalleryRows', () => {
  it('lays a country chapter out as a header, then rows of the peek, with an "N more" cell', () => {
    // Japan has 20 places: a 7-place peek is two rows of four, the second row ending in the "13 more" tile.
    const rows = rowsFor(places(20), 'country');
    expect(kinds(rows)).toEqual(['header', 'tiles', 'tiles']);
    const [, first, second] = rows;
    expect(first.kind === 'tiles' && first.cells).toHaveLength(4);
    expect(second.kind === 'tiles' && second.cells.map((c) => c.kind)).toEqual(['tile', 'tile', 'tile', 'more']);
    expect(second.kind === 'tiles' && second.cells[3]).toEqual({ kind: 'more', count: 13 });
  });

  it('peeks fewer on a phone, in rows of two', () => {
    const rows = rowsFor(places(20), 'country', { cols: 2, peek: MOBILE_PEEK });
    expect(tilesIn(rows)).toHaveLength(MOBILE_PEEK);
    const tiles = rows.filter((r) => r.kind === 'tiles');
    expect(tiles).toHaveLength(3);
    // Five places and the "15 more" cell: two, two, and a last row of one tile and the cell.
    expect(tiles[2].kind === 'tiles' && tiles[2].cells.map((c) => c.kind)).toEqual(['tile', 'more']);
  });

  it('shows no "more" cell when a chapter fits its peek', () => {
    const rows = rowsFor(places(DESKTOP_PEEK), 'country');
    expect(tilesIn(rows)).toHaveLength(DESKTOP_PEEK);
    expect(rows.some((r) => r.kind === 'tiles' && r.cells.some((c) => c.kind === 'more'))).toBe(false);
  });

  it('opens every place of an expanded chapter, and only that chapter', () => {
    const items = [...places(12, () => ({ country: 'Japan' })), ...places(12, (i) => ({ id: `q${i}`, country: 'Italy', city: 'Rome' }))];
    const rows = rowsFor(items, 'country', { expanded: new Set(['country:japan']) });
    expect(tilesIn(rows).filter((id) => id.startsWith('p'))).toHaveLength(12);
    expect(tilesIn(rows).filter((id) => id.startsWith('q'))).toHaveLength(DESKTOP_PEEK);
  });

  it('numbers the cells of a chapter across its rows, for screen readers', () => {
    const rows = rowsFor(places(20), 'country');
    const tiles = rows.filter((r): r is Extract<GalleryRow, { kind: 'tiles' }> => r.kind === 'tiles');
    expect(tiles.map((r) => [r.firstPos, r.setSize])).toEqual([
      [1, DESKTOP_PEEK + 1],
      [5, DESKTOP_PEEK + 1],
    ]);
  });

  it('marks the last row of a chapter, which carries the gap before the next one', () => {
    const items = [...places(6, () => ({ country: 'Japan' })), ...places(2, (i) => ({ id: `q${i}`, country: 'Italy', city: 'Rome' }))];
    const rows = rowsFor(items, 'country');
    expect(rows.filter((r) => r.kind === 'tiles').map((r) => r.kind === 'tiles' && r.last)).toEqual([false, true, true]);
  });

  it('narrows a country chapter to the chosen city, and ignores a city that is no longer a choice', () => {
    const items = [
      ...places(5, (i) => ({ id: `k${i}`, city: 'Kyoto' })),
      ...places(3, (i) => ({ id: `t${i}`, city: 'Tokyo' })),
    ];
    const chosen = rowsFor(items, 'country', { cityBy: new Map([['country:japan', 'Tokyo']]) });
    expect(tilesIn(chosen)).toEqual(['t0', 't1', 't2']);
    expect(chosen[0]).toMatchObject({ kind: 'header', city: 'Tokyo' });

    const stale = rowsFor(items, 'country', { cityBy: new Map([['country:japan', 'Osaka']]) });
    expect(tilesIn(stale)).toHaveLength(DESKTOP_PEEK);
    expect(stale[0]).toMatchObject({ kind: 'header', city: null });
  });

  it('only offers city chips in the country grouping', () => {
    const items = [...places(3, (i) => ({ id: `k${i}`, city: 'Kyoto' })), ...places(3, (i) => ({ id: `t${i}`, city: 'Tokyo' }))];
    const chapter = buildChapters(items, 'country', [], NOW)[0];
    expect(activeCityOf(chapter, 'Kyoto')).toBe('Kyoto');
    expect(activeCityOf(chapter, null)).toBeNull();
    const onlyKyoto = buildChapters(items.slice(0, 3), 'country', [], NOW)[0];
    expect(activeCityOf(onlyKyoto, 'Kyoto')).toBeNull();
    const cityRows = rowsFor(items, 'city', { cityBy: new Map([['city:kyoto', 'Kyoto']]) });
    expect(cityRows.filter((r) => r.kind === 'header').every((r) => r.kind === 'header' && r.city === null)).toBe(true);
  });

  it.each<GroupMode>(['city', 'collection', 'shelf', 'kind', 'month', 'saved'])('windows every chapter of the %s grouping the same way', (group) => {
    const items = places(60, (i) => ({
      city: `City ${i % 6}`,
      country: `Country ${i % 3}`,
      kind: (['cafe', 'park', 'museum'] as const)[i % 3],
      visitStatus: (['visited', 'planned', 'not_visited'] as const)[i % 3],
      createdAt: `2025-0${(i % 9) + 1}-01T00:00:00Z`,
    }));
    const chapters = buildChapters(items, group, [], NOW);
    const rows = buildGalleryRows(chapters, opts({ group }));
    expect(rows.filter((r) => r.kind === 'header')).toHaveLength(chapters.length);
    for (const chapter of chapters) {
      const shown = rows.flatMap((r) => (r.kind === 'tiles' && r.chapter.key === chapter.key ? r.cells : []));
      expect(shown.filter((c) => c.kind === 'tile')).toHaveLength(Math.min(chapter.items.length, DESKTOP_PEEK));
    }
  });

  it('is bounded by the peeks, not the library, however many chapters there are', () => {
    const items = places(5000, (i) => ({ city: `City ${i % 650}` }));
    const rows = rowsFor(items, 'city');
    expect(rows.filter((r) => r.kind === 'header')).toHaveLength(650);
    // Seven or eight places each: the peek keeps seven, a whole library would be 5,000 tiles.
    expect(tilesIn(rows)).toHaveLength(650 * DESKTOP_PEEK);
    expect(rows.length).toBeLessThan(650 * 4);
  });

  describe('"No grouping"', () => {
    it('is one chapter with no header, a page at a time, closed by a "Show more" row', () => {
      const rows = rowsFor(places(130), 'none');
      expect(rows[0].kind).toBe('tiles');
      expect(tilesIn(rows)).toHaveLength(PAGE);
      const pager = rows[rows.length - 1];
      expect(pager).toMatchObject({ kind: 'pager', next: PAGE, remaining: 130 - PAGE });
      // The button follows the grid at a tight gap, so the last tile row is not "last".
      expect(rows.filter((r) => r.kind === 'tiles').every((r) => r.kind === 'tiles' && !r.last)).toBe(true);
    });

    it('opens another page, down to a short final page, then drops the button', () => {
      const three = rowsFor(places(130), 'none', { pages: 3 });
      expect(tilesIn(three)).toHaveLength(130);
      expect(three.some((r) => r.kind === 'pager')).toBe(false);
      expect(three.filter((r) => r.kind === 'tiles').at(-1)).toMatchObject({ last: true });

      const two = rowsFor(places(130), 'none', { pages: 2 });
      expect(two.at(-1)).toMatchObject({ kind: 'pager', next: 130 - 2 * PAGE, remaining: 130 - 2 * PAGE });
    });

    it('numbers its tiles through the whole list', () => {
      const rows = rowsFor(places(10), 'none', { cols: 4 });
      expect(rows.map((r) => r.kind === 'tiles' && [r.firstPos, r.setSize])).toEqual([[1, 10], [5, 10], [9, 10]]);
    });
  });

  it('puts the phone interlude after the first chapter, wherever its rows end', () => {
    const items = [...places(12, () => ({ country: 'Japan' })), ...places(10, (i) => ({ id: `q${i}`, country: 'Italy', city: 'Rome' }))];
    const rows = rowsFor(items, 'country', { interlude: true });
    const at = kinds(rows).indexOf('interlude');
    expect(rowChapterKey(rows[at - 1])).toBe('country:japan');
    expect(rows[at + 1]).toMatchObject({ kind: 'header', chapter: { key: 'country:italy' } });
    expect(kinds(rowsFor(items, 'country')).includes('interlude')).toBe(false);
  });

  it('gives every row a unique, stable key', () => {
    const rows = rowsFor(places(40, (i) => ({ country: `Country ${i % 4}`, city: `City ${i % 8}` })), 'country', { interlude: true });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rowsFor(places(40, (i) => ({ country: `Country ${i % 4}`, city: `City ${i % 8}` })), 'country', { interlude: true }).map((r) => r.key)).toEqual(rows.map((r) => r.key));
  });
});

describe('chapterRowIndex', () => {
  it('maps each chapter to its header row, so the index can jump to it', () => {
    const items = [...places(12, () => ({ country: 'Japan' })), ...places(10, (i) => ({ id: `q${i}`, country: 'Italy', city: 'Rome' }))];
    const rows = rowsFor(items, 'country', { interlude: true });
    const index = chapterRowIndex(rows, rowChapterKey);
    expect(rows[index.get('country:japan')!]).toMatchObject({ kind: 'header' });
    expect(rows[index.get('country:italy')!]).toMatchObject({ kind: 'header', chapter: { key: 'country:italy' } });
  });

  it('points the single "No grouping" chapter at its first row', () => {
    const rows = rowsFor(places(5), 'none');
    expect(chapterRowIndex(rows, rowChapterKey).get('all')).toBe(0);
  });
});
