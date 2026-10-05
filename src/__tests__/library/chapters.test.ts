import { buildChapters, captionFor, chapterSummary, citiesOf, collectionEyebrow } from '@/lib/library/chapters';
import { item } from '../helpers/library-items';

const NOW = new Date('2026-10-05T12:00:00Z');

const places = [
  item({ id: 'kyoto-1', city: 'Kyoto', country: 'Japan', visitStatus: 'visited', kind: 'landmark' }),
  item({ id: 'kyoto-2', city: 'Kyoto', country: 'Japan', visitStatus: 'planned', kind: 'park' }),
  item({ id: 'tokyo-1', city: 'Tokyo', country: 'japan', kind: 'landmark' }),
  item({ id: 'rome-1', city: 'Rome', country: 'Italy', kind: 'cafe' }),
  item({ id: 'nowhere', city: null, country: null, kind: 'tip' }),
];

describe('buildChapters', () => {
  it('groups by country — one chapter per country however it is spelled — biggest first, then the unplaced', () => {
    const chapters = buildChapters(places, 'country', [], NOW);
    expect(chapters.map((c) => [c.title, c.items.length])).toEqual([
      ['Japan', 3],
      ['Italy', 1],
      ['No country yet', 1],
    ]);
    expect(chapters[0].flag).toBe('🇯🇵');
    expect(chapters[0].href).toBe('/explore/atlas/japan');
  });

  it('groups by city with the country as the eyebrow', () => {
    const chapters = buildChapters(places, 'city', [], NOW);
    expect(chapters[0]).toMatchObject({ title: 'Kyoto', eyebrow: 'Japan' });
    expect(chapters.at(-1)?.title).toBe('No city yet');
  });

  it('groups by collection, then the places in none', () => {
    const chapters = buildChapters(places, 'collection', [{ id: 'col_1', name: 'Kyoto trip', placeIds: ['kyoto-1', 'kyoto-2', 'gone'] }], NOW);
    expect(chapters.map((c) => [c.title, c.items.length])).toEqual([
      ['Kyoto trip', 2],
      ['Not in a collection yet', 3],
    ]);
    expect(chapters[0].href).toBe('/collections/col_1');
  });

  it('groups by shelf in planning order and by kind', () => {
    expect(buildChapters(places, 'shelf', [], NOW).map((c) => c.title)).toEqual(['Planned', 'Still dreaming', 'Been']);
    expect(buildChapters(places, 'kind', [], NOW)[0]).toMatchObject({ title: 'Landmark' });
  });

  it('groups by best month starting this month; a place good in two months is in both', () => {
    const seasonal = [
      item({ id: 'nov', bestTime: { months: [11], yearRound: false, times: [] } }),
      item({ id: 'oct-nov', bestTime: { months: [10, 11], yearRound: false, times: [] } }),
      item({ id: 'always', bestTime: { months: [], yearRound: true, times: [] } }),
      item({ id: 'unknown' }),
    ];
    const chapters = buildChapters(seasonal, 'month', [], NOW);
    expect(chapters.map((c) => [c.title, c.items.map((p) => p.id)])).toEqual([
      ['October', ['oct-nov']],
      ['November', ['nov', 'oct-nov']],
      ['Any time of year', ['always']],
      ['No best time yet', ['unknown']],
    ]);
    expect(chapters[0].eyebrow).toBe('This month');
  });

  it('groups by the month saved, newest first, and "none" is one chapter', () => {
    const saved = [
      item({ id: 'old', createdAt: '2024-02-10T00:00:00Z' }),
      item({ id: 'new', createdAt: '2025-09-01T00:00:00Z' }),
    ];
    expect(buildChapters(saved, 'saved', [], NOW).map((c) => c.title)).toEqual(['September 2025', 'February 2024']);
    expect(buildChapters(saved, 'none', [], NOW)).toHaveLength(1);
    expect(buildChapters([], 'country', [], NOW)).toEqual([]);
  });
});

describe('captionFor', () => {
  it('says why the place matters, in priority order', () => {
    expect(captionFor(item({ id: 'v', visitStatus: 'visited', lastVisited: '2024-04-12' }))).toEqual({ text: 'Been · Apr 2024' });
    expect(captionFor(item({ id: 'p', visitStatus: 'planned', plannedVisit: '2026-11-18' }))).toEqual({ text: 'Planned · Nov 18, 2026' });
    expect(captionFor(item({ id: 'n', notes: ' Go at dusk ' }))).toEqual({ text: 'Go at dusk', quote: true });
    expect(captionFor(item({ id: 'r', recommendedBy: 'Kenji' }))).toEqual({ text: 'Tip from Kenji' });
    expect(captionFor(item({ id: 'b', bestTimeText: 'Spring' }))).toEqual({ text: 'Best: Spring' });
    expect(captionFor(item({ id: 'x' }))).toBeUndefined();
  });

  it('does not slip a day across time zones for a date-only visit', () => {
    expect(captionFor(item({ id: 'd', visitStatus: 'visited', lastVisited: '2024-05-01' }))?.text).toBe('Been · May 2024');
  });
});

describe('chapter text', () => {
  it('summarises a chapter and lists its cities by count', () => {
    const japan = places.filter((p) => p.country?.toLowerCase() === 'japan');
    expect(chapterSummary(japan)).toBe('3 places · 2 cities · 1 been · 1 planned');
    expect(citiesOf(japan)).toEqual([
      { city: 'Kyoto', count: 2 },
      { city: 'Tokyo', count: 1 },
    ]);
  });

  it('labels a collection by its next date, or as a memory', () => {
    expect(collectionEyebrow([item({ id: 'a', visitStatus: 'planned', plannedVisit: '2027-05-10' })], NOW)).toBe('Coming up · May 2027');
    expect(collectionEyebrow([item({ id: 'b', visitStatus: 'visited', lastVisited: '2023-09-14' })], NOW)).toBe('A memory · Sep 2023');
    expect(collectionEyebrow([item({ id: 'c' })], NOW)).toBeUndefined();
  });
});
