import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryClient } from '@/components/library/library-client'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import type { LibraryData, LibraryItem } from '@/lib/library/types'
import { item, photo } from '../helpers/library-items'

let query = ''
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => '/library',
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
    matches: kind === 'desktop' && /min-width: (640|768|1280)px/.test(q),
    media: q,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }))
}

/** The Library inside the (app) shell's <main>, which is the scroll container the gallery windows against. */
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
const scrollMain = (main: HTMLElement, top: number) => {
  act(() => {
    main.scrollTop = top
    fireEvent.scroll(main)
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

describe('the virtualized gallery', () => {
  it('mounts the places near the screen, not the library', () => {
    // 30 countries x 40 places is 1,200 places and a 7-place peek each: 210 tiles to show, a handful on screen.
    renderLibrary(dataFor(library(40)))
    expect(placeButtons().length).toBeGreaterThan(0)
    expect(placeButtons().length).toBeLessThan(40)
    expect(screen.getByRole('heading', { level: 2, name: 'Country 00' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Country 29' })).not.toBeInTheDocument()
  })

  it('stays small when there is no grouping at all', async () => {
    query = 'group=none'
    const { main } = renderLibrary(dataFor(library(40)))
    expect(placeButtons().length).toBeGreaterThan(0)
    expect(placeButtons().length).toBeLessThan(40)
    // The page of 48 is still how "No grouping" opens; the rest is behind the button at the end of it.
    expect(screen.queryByRole('button', { name: 'Show 48 more of 1152' })).not.toBeInTheDocument()
    scrollMain(main, 6000)
    expect(await screen.findByRole('button', { name: 'Show 48 more of 1152' })).toBeInTheDocument()
    expect(placeButtons().length).toBeLessThan(40)
  })

  it('still opens "No grouping" a page at a time', async () => {
    const user = userEvent.setup()
    query = 'group=none'
    const { main } = renderLibrary(dataFor(library(40)))
    scrollMain(main, 6000)
    await user.click(await screen.findByRole('button', { name: 'Show 48 more of 1152' }))
    scrollMain(main, 14000)
    expect(await screen.findByRole('button', { name: 'Show 48 more of 1104' })).toBeInTheDocument()
  })

  it('names each tile\'s place in its chapter for a screen reader', () => {
    renderLibrary(dataFor(library(40)))
    const list = screen.getAllByRole('list', { name: 'Country 00' })[0]
    const tiles = within(list).getAllByRole('listitem')
    expect(tiles.map((t) => t.getAttribute('aria-posinset'))).toEqual(['1', '2', '3', '4'])
    // 7 places peek, plus the "33 more" cell, make the set of 8.
    expect(tiles.every((t) => t.getAttribute('aria-setsize') === '8')).toBe(true)
  })

  it('starts j/k from the first on-screen place when focus is in above-viewport overscan', async () => {
    const user = userEvent.setup()
    renderLibrary(dataFor(library(20)))
    const places = [...placeButtons()] as HTMLElement[]
    expect(places.length).toBeGreaterThan(2)

    // jsdom has no layout; j/k only walks tiles with a non-null offsetParent.
    const offsetParentDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentElement
      },
    })

    places[0].focus()
    expect(places[0]).toHaveFocus()
    for (const el of places) {
      el.scrollIntoView = jest.fn()
    }

    // Two overscan tiles sit above <main>; the third is the first on screen.
    const rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.tagName === 'MAIN') {
        return { top: 100, bottom: 900, left: 0, right: 800, width: 800, height: 800, x: 0, y: 100, toJSON: () => ({}) }
      }
      const i = places.indexOf(this as HTMLElement)
      if (i === 0 || i === 1) {
        const top = i === 0 ? -200 : -50
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

  it('starts j/k from the first on-screen place when focus is in below-viewport overscan', async () => {
    const user = userEvent.setup()
    renderLibrary(dataFor(library(20)))
    const places = [...placeButtons()] as HTMLElement[]
    expect(places.length).toBeGreaterThan(3)

    const offsetParentDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentElement
      },
    })

    const below = places.length - 1
    places[below].focus()
    expect(places[below]).toHaveFocus()
    for (const el of places) {
      el.scrollIntoView = jest.fn()
    }

    // On-screen tiles start at index 0; the focused tile sits in overscan below <main>.
    const rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.tagName === 'MAIN') {
        return { top: 100, bottom: 900, left: 0, right: 800, width: 800, height: 800, x: 0, y: 100, toJSON: () => ({}) }
      }
      const i = places.indexOf(this as HTMLElement)
      if (i === below) {
        return { top: 950, bottom: 1030, left: 0, right: 100, width: 100, height: 80, x: 0, y: 950, toJSON: () => ({}) }
      }
      if (i >= 0) {
        const top = 120 + i * 90
        return { top, bottom: top + 80, left: 0, right: 100, width: 100, height: 80, x: 0, y: top, toJSON: () => ({}) }
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      await user.keyboard('j')
      expect(places[0]).toHaveFocus()
    } finally {
      rectSpy.mockRestore()
      if (offsetParentDesc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDesc)
    }
  })

  it('opens "N more" for one chapter without opening the others', async () => {
    const user = userEvent.setup()
    const { main } = renderLibrary(dataFor(library(20)))
    await user.click(screen.getAllByRole('button', { name: '13 more in Country 00' })[0])
    await waitFor(() => expect(screen.queryByRole('button', { name: '13 more in Country 00' })).not.toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: /^Place 0-/ }).length).toBeGreaterThan(7)
    // Country 00 is five rows of four now; the next chapter starts below them and is still closed.
    scrollMain(main, 2000)
    expect(await screen.findByRole('button', { name: '13 more in Country 01' })).toBeInTheDocument()
  })

  it('keeps the city chips of a country chapter working', async () => {
    const user = userEvent.setup()
    renderLibrary(dataFor(library(20)))
    const chips = screen.getAllByRole('button', { name: /^Country 00 City 1 5$/ })
    await user.click(chips[0])
    expect(screen.getAllByRole('button', { name: /^Country 00 City 1 5$/ })[0]).toHaveAttribute('aria-pressed', 'true')
    // Five places in the city, so no "more" tile is left for the country.
    expect(screen.queryByRole('button', { name: /more in Country 00/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Place 0-1,/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Place 0-0,/ })).not.toBeInTheDocument()
  })

  it('lays a phone out in twos with a shorter peek and the trips after the first chapter', () => {
    setScreen('phone')
    const collections = [{ id: 'col_1', name: 'Autumn trip', placeIds: ['0-1', '1-1'] }]
    renderLibrary(dataFor(library(20), collections))
    const list = screen.getAllByRole('list', { name: 'Country 00' })[0]
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    // 5 places peek on a phone, so 15 are still behind the "more" tile.
    expect(screen.getAllByRole('button', { name: '15 more in Country 00' }).length).toBeGreaterThan(0)
    // The trips shelf renders under the tools, and again as the interlude row after the first chapter.
    expect(screen.getAllByRole('link', { name: /Autumn trip/ }).length).toBeGreaterThanOrEqual(2)
  })

  describe('the index', () => {
    it('jumps to a chapter that is not mounted by scrolling the <main> to it', async () => {
      const user = userEvent.setup()
      const { main } = renderLibrary(dataFor(library(20)))
      const nav = screen.getByRole('navigation', { name: 'Index' })
      expect(screen.queryByRole('heading', { level: 2, name: 'Country 05' })).not.toBeInTheDocument()
      await user.click(within(nav).getByRole('button', { name: /Country 05/ }))
      // The scroll box is <main>, never the window.
      expect(main.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
      const { top } = (main.scrollTo as jest.Mock).mock.calls.at(-1)![0] as { top: number }
      expect(top).toBeGreaterThan(0)
    })

    it('follows the chapter under the sticky tools while you scroll', async () => {
      const { main } = renderLibrary(dataFor(library(20)))
      const nav = screen.getByRole('navigation', { name: 'Index' })
      await waitFor(() => expect(within(nav).getByRole('button', { name: /Country 00/ })).toHaveAttribute('aria-current', 'location'))

      // Far enough down that Country 00's rows are well behind us.
      scrollMain(main, 4000)
      await waitFor(() => expect(within(nav).getByRole('button', { name: /Country 00/ })).not.toHaveAttribute('aria-current'))
      const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'location')
      expect(current).toHaveLength(1)

      scrollMain(main, 0)
      await waitFor(() => expect(within(nav).getByRole('button', { name: /Country 00/ })).toHaveAttribute('aria-current', 'location'))
    })
  })

  describe('scroll position on Back', () => {
    const popped = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate')))

    it('remembers the row at the top, per URL', async () => {
      const { main } = renderLibrary(dataFor(library(20)))
      scrollMain(main, 4000)
      await waitFor(() => expect(sessionStorage.getItem('td:library-scroll:v1:/library')).not.toBeNull(), { timeout: 2000 })
      const saved = JSON.parse(sessionStorage.getItem('td:library-scroll:v1:/library')!) as { rowKey: string; top: number }
      expect(saved.rowKey).toMatch(/^[htp]:/)
      expect(saved.top).toBe(4000)
    })

    it('flushes a pending save when unmounted before the debounce fires', () => {
      const { main, unmount } = renderLibrary(dataFor(library(20)))
      scrollMain(main, 4000)
      expect(sessionStorage.getItem('td:library-scroll:v1:/library')).toBeNull()
      // App Router pushState runs before the gallery's effect cleanup; memory must stay under /library.
      window.history.pushState(null, '', '/place/x')
      unmount()
      expect(sessionStorage.getItem('td:library-scroll:v1:/place/x')).toBeNull()
      const saved = JSON.parse(sessionStorage.getItem('td:library-scroll:v1:/library')!) as { rowKey: string; top: number }
      expect(saved.rowKey).toMatch(/^[htp]:/)
      expect(saved.top).toBe(4000)
    })

    it('scrolls back to it when the Library mounts after a Back', async () => {
      sessionStorage.setItem('td:library-scroll:v1:/library', JSON.stringify({ rowKey: 't:country:country-05:0', top: 9000 }))
      popped()
      const { main } = renderLibrary(dataFor(library(20)))
      await waitFor(() => expect(main.scrollTo).toHaveBeenCalled())
    })

    it('starts at the top on a fresh visit, however recent a Back was', () => {
      popped()
      fireEvent.click(document.body)
      sessionStorage.setItem('td:library-scroll:v1:/library', JSON.stringify({ rowKey: 't:country:country-05:0', top: 9000 }))
      const { main } = renderLibrary(dataFor(library(20)))
      expect(main.scrollTo).not.toHaveBeenCalled()
      expect(sessionStorage.getItem('td:library-scroll:v1:/library')).toBeNull()
    })

    it('forgets the position when you are back above the list', async () => {
      const { main } = renderLibrary(dataFor(library(20)))
      sessionStorage.setItem('td:library-scroll:v1:/library', JSON.stringify({ rowKey: 'h:country:country-05', top: 9000 }))
      // jsdom has no layout, so every box sits at 0: the list starts at the top of <main>, never above it.
      jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const top = this.tagName === 'MAIN' ? 0 : 400
        return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
      })
      scrollMain(main, 0)
      await waitFor(() => expect(sessionStorage.getItem('td:library-scroll:v1:/library')).toBeNull(), { timeout: 2000 })
      jest.restoreAllMocks()
    })
  })
})
