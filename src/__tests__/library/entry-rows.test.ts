import { buildChapters } from '@/lib/library/chapters';
import { buildEntryRows, entryChapterKey, type EntryRow, type EntryRowOptions } from '@/lib/library/entry-rows';
import { chapterRowIndex } from '@/lib/library/gallery-rows';
import type { GroupMode, LibraryItem } from '@/lib/library/types';
import { item } from '../helpers/library-items';

const NOW = new Date('2026-10-05T12:00:00Z');
const NONE: EntryRowOptions = { view: 'list', group: 'country', limits: new Map(), cityBy: new Map(), interlude: false };

const places = (n: number, over: (i: number) => Partial<LibraryItem> = () => ({})) =>
  Array.from({ length: n }, (_, i) => item({ id: `p${i}`, ...over(i) }));
const rowsFor = (items: LibraryItem[], group: GroupMode, o: Partial<EntryRowOptions> = {}) =>
  buildEntryRows(buildChapters(items, group, [], NOW), { ...NONE, group, ...o });
const kinds = (rows: EntryRow[]) => rows.map((r) => r.kind);
const entriesIn = (rows: EntryRow[]) => rows.flatMap((r) => (r.kind === 'entry' ? [r.item.id] : []));

describe('buildEntryRows', () => {
  it('opens a list chapter with 40 places, then offers the rest', () => {
    const rows = rowsFor(places(60), 'country');
    expect(kinds(rows)).toEqual(['header', 'columns', ...Array(40).fill('entry'), 'more']);
    expect(rows.at(-1)).toMatchObject({ kind: 'more', hidden: 20, open: 60 });
  });

  it('opens a journal chapter with 6 places and no column titles', () => {
    const rows = rowsFor(places(10), 'country', { view: 'journal' });
    expect(kinds(rows)).toEqual(['header', ...Array(6).fill('entry'), 'more']);
    expect(rows.at(-1)).toMatchObject({ kind: 'more', hidden: 4, open: 10 });
  });

  it('shows the whole chapter once it has been opened', () => {
    const rows = rowsFor(places(60), 'country', { limits: new Map([['country:japan', 60]]) });
    expect(entriesIn(rows)).toHaveLength(60);
    expect(kinds(rows)).not.toContain('more');
  });

  it('shows a map chapter in full, with no "more"', () => {
    const rows = rowsFor(places(300), 'country', { view: 'map' });
    expect(kinds(rows)).toEqual(['header', ...Array(300).fill('entry')]);
  });

  it('pages the single "No grouping" chapter a page at a time, in every view', () => {
    const chapters = buildChapters(places(250), 'none', [], NOW);
    const first = buildEntryRows(chapters, { ...NONE, group: 'none' });
    expect(kinds(first).filter((k) => k === 'entry')).toHaveLength(100);
    expect(first.at(-1)).toMatchObject({ kind: 'more', hidden: 150, open: 200 });
    // No chapter header for the single chapter; the list's column titles still lead.
    expect(kinds(first)[0]).toBe('columns');
    const journal = buildEntryRows(chapters, { ...NONE, group: 'none', view: 'journal' });
    expect(entriesIn(journal)).toHaveLength(24);
    expect(journal.at(-1)).toMatchObject({ kind: 'more', hidden: 226, open: 48 });
  });

  it('numbers a chapter\'s places for a screen reader, and marks the last one', () => {
    const rows = rowsFor(places(3), 'country').filter((r): r is Extract<EntryRow, { kind: 'entry' }> => r.kind === 'entry');
    expect(rows.map((r) => [r.pos, r.setSize, r.last])).toEqual([[1, 3, false], [2, 3, false], [3, 3, true]]);
  });

  it('leaves the last place unmarked while "more" closes the chapter', () => {
    const rows = rowsFor(places(50), 'country').filter((r) => r.kind === 'entry');
    expect(rows.some((r) => r.kind === 'entry' && r.last)).toBe(false);
  });

  it('narrows a journal country chapter to the chosen city, but not a list or a map', () => {
    const items = places(10, (i) => ({ country: 'Japan', city: i < 3 ? 'Tokyo' : 'Kyoto' }));
    const cityBy = new Map([['country:japan', 'Tokyo']]);
    expect(entriesIn(rowsFor(items, 'country', { view: 'journal', cityBy }))).toHaveLength(3);
    expect(entriesIn(rowsFor(items, 'country', { view: 'list', cityBy }))).toHaveLength(10);
    expect(entriesIn(rowsFor(items, 'country', { view: 'map', cityBy }))).toHaveLength(10);
    expect(rowsFor(items, 'country', { view: 'journal', cityBy })[0]).toMatchObject({ kind: 'header', city: 'Tokyo' });
  });

  it('puts the phone interlude after the first chapter, wherever its rows end', () => {
    const items = [...places(12, () => ({ country: 'Japan' })), ...places(10, (i) => ({ id: `q${i}`, country: 'Italy', city: 'Rome' }))];
    const rows = rowsFor(items, 'country', { interlude: true });
    const at = kinds(rows).indexOf('interlude');
    expect(entryChapterKey(rows[at - 1])).toBe('country:japan');
    expect(rows[at + 1]).toMatchObject({ kind: 'header', chapter: { key: 'country:italy' } });
    expect(kinds(rowsFor(items, 'country')).includes('interlude')).toBe(false);
  });

  it('gives every row a unique, stable key, even for a place that is in two chapters', () => {
    const items = places(30, (i) => ({ country: `Country ${i % 3}` }));
    const chapters = buildChapters(items, 'collection', [{ id: 'a', name: 'A', placeIds: ['p0', 'p1'] }, { id: 'b', name: 'B', placeIds: ['p0'] }], NOW);
    const rows = buildEntryRows(chapters, { ...NONE, group: 'collection' });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('lets the index jump to the first row of each chapter', () => {
    const rows = rowsFor(places(6, (i) => ({ country: i < 3 ? 'Japan' : 'Italy', city: 'X' })), 'country');
    const index = chapterRowIndex(rows, entryChapterKey);
    expect(rows[index.get('country:japan')!]).toMatchObject({ kind: 'header' });
    expect(rows[index.get('country:italy')!]).toMatchObject({ kind: 'header', chapter: { key: 'country:italy' } });
    // The single chapter has no header, so its first row is the jump target.
    const single = rowsFor(places(3), 'none');
    expect(chapterRowIndex(single, entryChapterKey).get('all')).toBe(0);
  });
});
