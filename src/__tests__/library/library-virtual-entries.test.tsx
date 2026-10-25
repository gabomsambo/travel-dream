import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryClient } from '@/components/library/library-client'
import { LibraryMapView } from '@/components/library/library-map-view'
import { LibraryActionsContext, type LibraryActions } from '@/components/library/library-actions'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import type { LibraryData, LibraryItem } from '@/lib/library/types'
import { item, photo } from '../helpers/library-items'

let query = ''
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => '/library',
}))
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicMock() {
    return <div data-testid="map-stub" />
  },
}))

const COUNTRIES = Array.from({ length: 30 }, (_, i) => `Country ${String(i).padStart(2, '0')}`)

/** 30 countries, 4 cities each, `perCountry` places in every country. */
const library = (perCountry: number): LibraryItem[] =>
  COUNTRIES.flatMap((country, c) =>
    Array.from({ length: perCountry }, (_, i) =>
      item({ id: `${c}-${i}`, name: `Place ${c}-${i}`, country, city: `${country} City ${i % 4}`, photos: [photo], createdAt: `2025-01-${String((i % 27) + 1).padStart(2, '0')}T00:00:00Z` })
    )
  )
const dataFor = (items: LibraryItem[], collections: LibraryData['collections'] = []): LibraryData => ({
  userId: 'usr_test',
  items,
  collections,
  inboxCount: 0,
  heartIds: [],
  savedViews: [],
})

/** Pretend the screen is a desktop (all breakpoints match) or a phone (none do). */
function setScreen(kind: 'desktop' | 'phone') {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({
    matches: kind === 'desktop' && /min-width: (640|768|1024|1280)px/.test(q),
    media: q,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }))
}

/** The Library inside the (app) shell's <main>, which is the scroll container the lists window against. */
function renderLibrary(data: LibraryData) {
  const view = render(
    <main data-testid="main" className="overflow-y-auto">
      <LibraryClient data={data} />
    </main>
  )
  const main = screen.getByTestId('main')
  main.scrollTo = jest.fn()
  return { ...view, main }
}
const placeButtons = () => document.querySelectorAll('button[data-place-id]')
const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top
    fireEvent.scroll(el)
  })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  query = ''
  resetHeartWriterForTests()
  ;(global.fetch as jest.Mock).mockReset().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ status: 'success' }) })
  window.history.replaceState(null, '', '/library')
  setScreen('desktop')
})

describe('the virtualized compact list', () => {
  beforeEach(() => {
    query = 'view=list'
  })

  it('mounts the rows near the screen, not the 40 a chapter opens with', () => {
    // 30 countries x 40 places: 1,200 rows are on offer, a screenful is mounted.
    renderLibrary(dataFor(library(40)))
    expect(placeButtons().length).toBeGreaterThan(0)
    expect(placeButtons().length).toBeLessThan(40)
    expect(screen.getByRole('heading', { level: 2, name: 'Country 00' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Country 29' })).not.toBeInTheDocument()
  })

  it('stays a table: it counts every row and numbers the mounted ones', () => {
    renderLibrary(dataFor(library(40)))
    const table = screen.getByRole('table', { name: 'Places' })
    // 30 chapters x (header + columns + 40 places + "more" is not needed at 40) = 30 x 42 rows.
    expect(table).toHaveAttribute('aria-rowcount', String(30 * 42))
    const rows = within(table).getAllByRole('row')
    expect(rows.length).toBeLessThan(60)
    expect(rows.map((r) => Number(r.getAttribute('aria-rowindex')))).toEqual(rows.map((_, i) => i + 1))
  })

  it('still opens the rest of a chapter behind its "Show N more" button', async () => {
    const user = userEvent.setup()
    renderLibrary(dataFor(library(60)))
    expect(screen.queryByRole('button', { name: 'Show 20 more' })).not.toBeInTheDocument()
    // Scroll to the end of the first chapter's 40 rows, where its button is.
    scrollTo(screen.getByTestId('main'), 2400)
    await user.click((await screen.findAllByRole('button', { name: 'Show 20 more' }))[0])
    // Country 00 shows all 60 now, so its button is gone and the 20 new rows are not all mounted at once.
    expect(screen.queryByRole('button', { name: 'Show 20 more' })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', String(30 * 43 - 1 + 20))
    expect(placeButtons().length).toBeLessThan(60)
  })

  it('follows the chapter under the sticky tools in the index', async () => {
    const { main } = renderLibrary(dataFor(library(40)))
    const nav = screen.getByRole('navigation', { name: 'Index' })
    await waitFor(() => expect(within(nav).getByRole('button', { name: /Country 00/ })).toHaveAttribute('aria-current', 'location'))
    scrollTo(main, 5000)
    await waitFor(() => expect(within(nav).getByRole('button', { name: /Country 00/ })).not.toHaveAttribute('aria-current'))
  })

  it('jumps to a chapter that is not mounted by scrolling the <main> to it', async () => {
    const user = userEvent.setup()
    const { main } = renderLibrary(dataFor(library(40)))
    const nav = screen.getByRole('navigation', { name: 'Index' })
    expect(screen.queryByRole('heading', { level: 2, name: 'Country 05' })).not.toBeInTheDocument()
    await user.click(within(nav).getByRole('button', { name: /Country 05/ }))
    const { top } = (main.scrollTo as jest.Mock).mock.calls.at(-1)![0] as { top: number }
    expect(top).toBeGreaterThan(0)
  })

  it('remembers the row at the top, per URL', async () => {
    const { main } = renderLibrary(dataFor(library(40)))
    scrollTo(main, 4000)
    await waitFor(() => expect(sessionStorage.getItem('td:library-scroll:v1:/library')).not.toBeNull(), { timeout: 2000 })
    const saved = JSON.parse(sessionStorage.getItem('td:library-scroll:v1:/library')!) as { rowKey: string }
    expect(saved.rowKey).toMatch(/^[hce]:/)
  })

  it('pages "No grouping" a hundred rows at a time', async () => {
    const user = userEvent.setup()
    query = 'view=list&group=none'
    const { main } = renderLibrary(dataFor(library(40)))
    scrollTo(main, 12000)
    await user.click(await screen.findByRole('button', { name: 'Show 1100 more' }))
    expect(await screen.findByRole('table')).toHaveAttribute('aria-rowcount', String(1 + 200 + 1))
  })

  it('keeps the phone trips interlude as a numbered table row', () => {
    setScreen('phone')
    const collections = [{ id: 'col_1', name: 'Autumn trip', placeIds: ['0-1', '1-1'] }]
    renderLibrary(dataFor(library(5), collections))
    const table = screen.getByRole('table', { name: 'Places' })
    // 30 chapters × (header + columns + 5 places) + the interlude after the first = 211.
    expect(table).toHaveAttribute('aria-rowcount', String(30 * 7 + 1))
    const rows = within(table).getAllByRole('row')
    const indices = rows.map((r) => Number(r.getAttribute('aria-rowindex')))
    // Header, columns, five places, then the interlude — index 8 must be a real row.
    expect(indices).toContain(8)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(new Set(indices).size).toBe(indices.length)
  })
})

describe('the virtualized journal', () => {
  beforeEach(() => {
    query = 'view=journal'
  })

  it('mounts the entries near the screen, and numbers them within their chapter', () => {
    renderLibrary(dataFor(library(40)))
    expect(placeButtons().length).toBeGreaterThan(0)
    expect(placeButtons().length).toBeLessThan(30)
    const entries = screen.getAllByRole('article')
    // A journal chapter opens with 6 entries.
    expect(entries[0]).toHaveAttribute('aria-posinset', '1')
    expect(entries[0]).toHaveAttribute('aria-setsize', '6')
  })

  it('opens the rest of a chapter behind its "N more entries" button', async () => {
    const user = userEvent.setup()
    const { main } = renderLibrary(dataFor(library(10)))
    scrollTo(main, 1300)
    const [first] = await screen.findAllByRole('button', { name: '4 more entries' })
    await user.click(first)
    // Country 00 shows all ten now; the buttons left belong to the chapters below it.
    expect(screen.getAllByRole('article').filter((a) => a.getAttribute('aria-setsize') === '10')).not.toHaveLength(0)
  })

  it('keeps the city chips of a country chapter working', async () => {
    const user = userEvent.setup()
    renderLibrary(dataFor(library(20)))
    const chip = screen.getAllByRole('button', { name: /^Country 00 City 1 5$/ })[0]
    await user.click(chip)
    expect(screen.getAllByRole('button', { name: /^Country 00 City 1 5$/ })[0]).toHaveAttribute('aria-pressed', 'true')
    // Five places in the city: all of them, and no "more" button for the chapter.
    expect(screen.queryByRole('button', { name: /more entr/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Place 0-1,/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Place 0-0,/ })).not.toBeInTheDocument()
  })
})

describe('the virtualized map side list', () => {
  const actions: LibraryActions = {
    hearts: new Set(),
    toggleHeart: jest.fn(),
    selected: new Set(),
    selecting: false,
    toggleSelect: jest.fn(),
    select: jest.fn(),
    activate: jest.fn(),
    openPlace: jest.fn(),
    archive: jest.fn(),
    remove: jest.fn(),
    addToCollection: jest.fn(),
    findImage: jest.fn(),
  }
  const stats = { total: 0, countries: 0, cities: 0, been: 0, planned: 0, dreaming: 0, passport: [] }
  const chaptersOf = (items: LibraryItem[]) =>
    COUNTRIES.map((country) => ({ key: `country:${country}`, title: country, items: items.filter((p) => p.country === country) }))

  function renderMap(items: LibraryItem[]) {
    const view = render(
      <LibraryActionsContext.Provider value={actions}>
        <main data-testid="main" className="overflow-y-auto">
          <LibraryMapView chapters={chaptersOf(items)} items={items} siblings={items.map((p) => p.id)} stats={stats} />
        </main>
      </LibraryActionsContext.Provider>
    )
    const main = screen.getByTestId('main')
    main.scrollTo = jest.fn()
    const side = document.querySelector<HTMLElement>('[data-side-list]')!
    side.scrollTo = jest.fn()
    return { ...view, main, side }
  }

  it('mounts the places near the screen, not every place in the library', () => {
    renderMap(library(100))
    expect(placeButtons().length).toBeGreaterThan(0)
    expect(placeButtons().length).toBeLessThan(40)
    expect(document.querySelectorAll('img').length).toBeLessThan(40)
  })

  it('scrolls its own list from lg up, and <main> below that', async () => {
    renderMap(library(100))
    const side = document.querySelector<HTMLElement>('[data-side-list]')!
    const wide = placeButtons().length
    // From lg the side list scrolls beside the map: scrolling <main> moves nothing in it.
    scrollTo(screen.getByTestId('main'), 3000)
    expect(document.querySelector('button[data-place-id="0-0"]')).toBeInTheDocument()
    scrollTo(side, 3000)
    await waitFor(() => expect(document.querySelector('button[data-place-id="0-0"]')).not.toBeInTheDocument())
    expect(placeButtons().length).toBeLessThan(wide + 20)
  })

  it('opens every place through the list, and names a place in its chapter', async () => {
    const user = userEvent.setup()
    const items = library(5)
    renderMap(items)
    const first = document.querySelector('button[data-place-id="0-0"]')!.closest('[aria-posinset]')!
    expect(first).toHaveAttribute('aria-posinset', '1')
    expect(first).toHaveAttribute('aria-setsize', '5')
    expect(screen.queryByRole('list', { name: 'Country 00' })).not.toBeInTheDocument()
    await user.click(document.querySelector('button[data-place-id="0-0"]')!)
    expect(actions.activate).toHaveBeenCalledWith('0-0', items.map((p) => p.id), { shiftKey: false })
  })

  it('starts j/k from the first place visible in the side list from lg', async () => {
    query = 'view=map'
    const user = userEvent.setup()
    renderLibrary(dataFor(library(20)))
    const places = [...placeButtons()] as HTMLElement[]
    expect(places.length).toBeGreaterThan(2)

    const offsetParentDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentElement
      },
    })

    for (const el of places) {
      el.scrollIntoView = jest.fn()
    }

    const side = document.querySelector<HTMLElement>('[data-side-list]')!
    // <main> is tall enough that overscan above the side list still sits inside it;
    // j/k must use the side list's clip, or cold j would land on a clipped row.
    const rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === side) {
        return { top: 100, bottom: 500, left: 0, right: 400, width: 400, height: 400, x: 0, y: 100, toJSON: () => ({}) }
      }
      if (this.tagName === 'MAIN') {
        return { top: 0, bottom: 2000, left: 0, right: 800, width: 800, height: 2000, x: 0, y: 0, toJSON: () => ({}) }
      }
      const i = places.indexOf(this as HTMLElement)
      if (i === 0 || i === 1) {
        const top = i === 0 ? -200 : 20
        return { top, bottom: top + 80, left: 0, right: 100, width: 100, height: 80, x: 0, y: top, toJSON: () => ({}) }
      }
      if (i >= 2) {
        const top = 120 + (i - 2) * 90
        return { top, bottom: top + 80, left: 0, right: 100, width: 100, height: 80, x: 0, y: top, toJSON: () => ({}) }
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      await user.keyboard('j')
      expect(places[2]).toHaveFocus()
    } finally {
      rectSpy.mockRestore()
      if (offsetParentDesc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDesc)
    }
  })

  describe('scroll position on Back', () => {
    const popped = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate')))

    it('remembers against <main> below lg', async () => {
      setScreen('phone')
      const { main } = renderMap(library(100))
      scrollTo(main, 3000)
      await waitFor(() => expect(sessionStorage.getItem('td:library-scroll:v1:/library')).not.toBeNull(), { timeout: 2000 })
      const saved = JSON.parse(sessionStorage.getItem('td:library-scroll:v1:/library')!) as { rowKey: string; top: number }
      expect(saved.rowKey).toMatch(/^[hce]:/)
      expect(saved.top).toBe(3000)
    })

    it('restores <main> on Back below lg', async () => {
      setScreen('phone')
      sessionStorage.setItem('td:library-scroll:v1:/library', JSON.stringify({ rowKey: 'h:country:Country 05', top: 9000 }))
      popped()
      const { main } = renderMap(library(100))
      await waitFor(() => expect(main.scrollTo).toHaveBeenCalled())
    })

    it('remembers against the side list from lg', async () => {
      setScreen('desktop')
      const { side } = renderMap(library(100))
      scrollTo(side, 3000)
      await waitFor(() => expect(sessionStorage.getItem('td:library-scroll:v1:/library')).not.toBeNull(), { timeout: 2000 })
      const saved = JSON.parse(sessionStorage.getItem('td:library-scroll:v1:/library')!) as { rowKey: string; top: number }
      expect(saved.rowKey).toMatch(/^[hce]:/)
      expect(saved.top).toBe(3000)
    })

    it('restores the side list on Back from lg', async () => {
      setScreen('desktop')
      sessionStorage.setItem('td:library-scroll:v1:/library', JSON.stringify({ rowKey: 'h:country:Country 05', top: 9000 }))
      popped()
      const { side } = renderMap(library(100))
      await waitFor(() => expect(side.scrollTo).toHaveBeenCalled())
    })
  })
})
