import { buildChapters } from '@/lib/library/chapters'
import { filterItems, parseFilters, sortItems, EMPTY_FILTERS, type FilterContext } from '@/lib/library/filters'
import { buildFirstScreen, firstScreenItems, INLINE_LIMIT, paramsFrom, type FirstScreenInput } from '@/lib/library/first-screen'
import { coverStats } from '@/lib/library/cover'
import { DESKTOP_PEEK } from '@/lib/library/gallery-rows'
import { item, photo } from '../helpers/library-items'

const NOW = new Date('2026-10-30T12:00:00Z')
const countries = ['Japan', 'Italy', 'Mexico', 'Spain']

// Uneven chapters: Japan holds most of the library, so the first screen has to stop part-way.
const places = Array.from({ length: 220 }, (_, i) =>
  item({
    id: `plc_${i}`,
    name: `Place ${i}`,
    country: i % 5 === 0 ? countries[1 + (i % 3)] : 'Japan',
    city: `City ${i % 7}`,
    photos: i % 10 === 0 ? [] : [photo],
    visitStatus: i % 4 === 0 ? 'visited' : i % 4 === 1 ? 'planned' : 'not_visited',
    lastVisited: i % 4 === 0 ? '2024-04-12' : null,
    createdAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
  })
)

const base = (params = ''): FirstScreenInput => ({
  userId: 'usr_test',
  version: 'v1',
  items: places,
  collections: [{ id: 'col_1', name: 'Trip', description: null, placeIds: ['plc_1', 'plc_2'] }],
  inboxCount: 4,
  heartIds: ['plc_3', 'plc_4', 'plc_gone'],
  savedViews: [{ id: 'svw_1', name: 'Coffee', query: 'kind=cafe' }],
  params: new URLSearchParams(params),
  now: NOW,
})

describe('the Library first screen', () => {
  it('is the same chapters the client builds, cut to the first few', () => {
    const seed = buildFirstScreen(base())
    const ctx: FilterContext = { searchIds: null, hearts: new Set(), collected: new Set(['plc_1', 'plc_2']), now: NOW }
    const expected = buildChapters(sortItems(filterItems(places, EMPTY_FILTERS, ctx), 'date-newest'), 'country', [], NOW)

    expect(seed.chapterCount).toBe(expected.length)
    expect(seed.chapters.length).toBeLessThan(expected.length)
    seed.chapters.forEach((c, i) => {
      expect(c.key).toBe(expected[i].key)
      expect(c.title).toBe(expected[i].title)
      expect(c.count).toBe(expected[i].items.length)
      expect(c.items.map((p) => p.id)).toEqual(expected[i].items.slice(0, DESKTOP_PEEK).map((p) => p.id))
    })
  })

  it('shows the figures the cover and shelves show, over the whole library', () => {
    const seed = buildFirstScreen(base())
    expect(seed.total).toBe(220)
    expect(seed.stats).toEqual(coverStats(places))
    expect(seed.shelfCounts).toEqual({
      all: 220,
      not_visited: places.filter((p) => p.visitStatus === 'not_visited').length,
      planned: places.filter((p) => p.visitStatus === 'planned').length,
      visited: places.filter((p) => p.visitStatus === 'visited').length,
      // plc_gone is a heart on a place the library does not hold
      hearts: 2,
    })
    expect(seed.cover).toHaveLength(7)
    expect(seed.inboxCount).toBe(4)
  })

  it('reads the URL the way the client does: filters, group and sort', () => {
    const seed = buildFirstScreen(base('country=Japan&group=city&sort=name-az&visitStatus=visited'))
    expect(seed.group).toBe('city')
    expect(seed.shelf).toBe('visited')
    const japanVisited = places.filter((p) => p.country === 'Japan' && p.visitStatus === 'visited')
    expect(seed.shown).toBe(japanVisited.length)
    expect(firstScreenItems(seed).every((p) => p.country === 'Japan' && p.visitStatus === 'visited')).toBe(true)
    expect(seed.chapters[0].cities).toEqual([])
  })

  it('gives a country chapter its city chips, counted over the whole chapter', () => {
    const seed = buildFirstScreen(base())
    const japan = seed.chapters.find((c) => c.key === 'country:japan')!
    expect(japan.cities.reduce((n, c) => n + c.count, 0)).toBe(japan.count)
    expect(japan.summary).toMatch(/^\d+ places/)
  })

  it('applies the search and the Hearts shelf from the URL', () => {
    const searched = buildFirstScreen(base('search=Place+17'))
    expect(firstScreenItems(searched).map((p) => p.id)).toContain('plc_17')
    expect(searched.shown).toBeLessThan(220)

    const hearts = buildFirstScreen(base('hearts=1'))
    expect(hearts.shelf).toBe('hearts')
    expect(firstScreenItems(hearts).map((p) => p.id).sort()).toEqual(['plc_3', 'plc_4'])
  })

  it('opens a screenful of "No grouping", not its first page of 48', () => {
    const seed = buildFirstScreen(base('group=none'))
    expect(seed.chapters).toHaveLength(1)
    expect(seed.chapters[0].key).toBe('all')
    expect(seed.chapters[0].items).toHaveLength(12)
    expect(seed.chapters[0].count).toBe(220)
  })

  it('knows when the trips shelf sits above the chapters', () => {
    expect(buildFirstScreen(base()).showTrips).toBe(true)
    expect(buildFirstScreen(base('kind=cafe')).showTrips).toBe(false)
    expect(buildFirstScreen(base('view=map')).showTrips).toBe(false)
    expect(buildFirstScreen({ ...base(), collections: [] }).showTrips).toBe(false)
  })

  it('carries the hearts, saved views and version the page needs, and nothing of the other places', () => {
    const seed = buildFirstScreen(base())
    expect(seed.version).toBe('v1')
    expect(seed.heartIds).toEqual(['plc_3', 'plc_4', 'plc_gone'])
    expect(seed.savedViews).toHaveLength(1)
    const sent = JSON.stringify(seed)
    expect(sent.length).toBeLessThan(JSON.stringify(places).length / 4)
    expect(sent).not.toContain('plc_219')
  })

  it('rebuilds the URL from a page’s search params, repeated keys included', () => {
    const params = paramsFrom({ country: ['Japan', 'Italy'], group: 'city', gone: undefined })
    expect(params.getAll('country')).toEqual(['Japan', 'Italy'])
    expect(params.get('group')).toBe('city')
    expect(params.has('gone')).toBe(false)
    expect(buildFirstScreen({ ...base(), params }).group).toBe('city')
  })

  it('leaves the choice of an inline library to the loader', () => {
    expect(INLINE_LIMIT).toBeGreaterThanOrEqual(12)
    expect(parseFilters(new URLSearchParams()).search).toBe('')
  })
})
