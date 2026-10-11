import { EMPTY_FILTERS } from '@/lib/library/filters'
import {
  archiveSearchParams,
  filterArchive,
  formatDay,
  locationLine,
  parseArchiveSort,
  parseArchiveView,
  setAsideLine,
  sortArchive,
  type ArchivePlace,
} from '@/lib/archive/view'

function place(over: Partial<ArchivePlace> & Pick<ArchivePlace, 'id' | 'name'>): ArchivePlace {
  return {
    kind: 'cafe',
    city: 'Lisbon',
    country: 'Portugal',
    description: null,
    notes: null,
    tags: [],
    vibes: [],
    ratingSelf: 0,
    visitStatus: 'not_visited',
    priceLevel: null,
    coverUrl: null,
    createdAt: '2024-11-02T00:00:00.000Z',
    archivedAt: null,
    trips: [],
    status: 'archived',
    ...over,
  }
}

describe('archive display', () => {
  it('formats a day without pretending a missing archive clock', () => {
    expect(formatDay('2026-03-12T00:00:00.000Z')).toBe('12 Mar 2026')
    expect(setAsideLine('2026-03-12T00:00:00.000Z', '2020-01-01T00:00:00.000Z')).toBe('Set aside 12 Mar 2026')
    expect(setAsideLine(null, '2024-11-02T00:00:00.000Z')).toBe('Saved 2 Nov 2024')
  })

  it('joins only the location parts that exist', () => {
    expect(locationLine('Lisbon', 'Portugal')).toBe('Lisbon, Portugal')
    expect(locationLine(null, 'Mexico')).toBe('Mexico')
    expect(locationLine(' ', null)).toBeNull()
    expect(locationLine(null, null)).toBeNull()
  })

  it('defaults to the list and recently set aside, and remembers the others in the URL', () => {
    expect(parseArchiveView(null)).toBe('list')
    expect(parseArchiveView('grid')).toBe('grid')
    expect(parseArchiveView('journal')).toBe('journal')
    expect(parseArchiveSort(null)).toBe('archived-newest')
    const qs = archiveSearchParams(
      { ...EMPTY_FILTERS, kinds: new Set(['cafe', 'museum']), hasPhotosOnly: true },
      { view: 'journal', sort: 'name-az' }
    )
    expect(qs.get('kind')).toBe('cafe,museum')
    expect(qs.get('view')).toBe('journal')
    expect(qs.get('sort')).toBe('name-az')
    expect(qs.get('hasPhotosOnly')).toBe('true')
    expect(archiveSearchParams(EMPTY_FILTERS, { view: 'list', sort: 'archived-newest' }).toString()).toBe('')
  })

  it('keeps several kinds and drops places with no photo when asked', () => {
    const rows = [
      place({ id: 'a', name: 'Cafe', kind: 'cafe', coverUrl: 'https://example.com/a.jpg' }),
      place({ id: 'b', name: 'Museum', kind: 'museum', coverUrl: null }),
      place({ id: 'c', name: 'Park', kind: 'park', coverUrl: 'https://example.com/c.jpg' }),
    ]
    const kinds = filterArchive(rows, { ...EMPTY_FILTERS, kinds: new Set(['cafe', 'museum']) }, null)
    expect(kinds.map((p) => p.id)).toEqual(['a', 'b'])
    const photos = filterArchive(rows, { ...EMPTY_FILTERS, hasPhotosOnly: true }, null)
    expect(photos.map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('sorts recently set aside first and leaves undated rows at the end', () => {
    const rows = [
      place({ id: 'old', name: 'Old', archivedAt: null, createdAt: '2020-01-01T00:00:00.000Z' }),
      place({ id: 'earlier', name: 'Earlier', archivedAt: '2025-01-01T00:00:00.000Z' }),
      place({ id: 'later', name: 'Later', archivedAt: '2026-06-01T00:00:00.000Z' }),
    ]
    expect(sortArchive(rows, 'archived-newest').map((p) => p.id)).toEqual(['later', 'earlier', 'old'])
  })
})
