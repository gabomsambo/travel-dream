/**
 * Discrete library updates use startTransition; urgent search must not steal their
 * history push. React 18.3 runs the transition callback synchronously and only
 * defers committing the setStates inside — Jest's act() flushes those commits in
 * the same turn as a click, so these tests hold the callback to keep discrete
 * work pending across an urgent search.
 *
 * Push intent is committed `historyEpoch` state scheduled inside that callback
 * (not a ref armed when the callback runs). Holding the callback is therefore
 * equivalent to a pending transition commit: an urgent search cannot see a push
 * flag that has not committed yet. flushHeld replays held callbacks inside one
 * real startTransition so functional filter updaters chain in commit order.
 */
const pending: Array<() => void> = []
let holdTransitions = false

jest.mock('react', () => {
  const actual = jest.requireActual('react') as typeof import('react')
  return {
    ...actual,
    startTransition: (cb: () => void) => {
      // Hold the setState callback itself so several discrete updates can be
      // replayed in one startTransition (functional updaters then chain).
      if (holdTransitions) pending.push(cb)
      else actual.startTransition(cb)
    },
  }
})

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryClient } from '@/components/library/library-client'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import type { LibraryData } from '@/lib/library/types'
import { item, photo } from '../helpers/library-items'
import { renderInMain as render, stubTallMain } from '../helpers/tall-main'

stubTallMain()

const countries = ['Japan', 'Italy', 'Mexico']
const items = Array.from({ length: 14 }, (_, i) =>
  item({
    id: `plc_${i}`,
    name: `Place ${i}`,
    country: countries[i % 3],
    city: `City ${i % 3}`,
    photos: i === 0 ? [] : [photo],
    visitStatus: i < 4 ? 'visited' : i < 6 ? 'planned' : 'not_visited',
    lastVisited: i < 4 ? '2024-04-12' : null,
    createdAt: `2025-0${(i % 9) + 1}-01T00:00:00Z`,
  })
)

const data: LibraryData = {
  userId: 'usr_test',
  items,
  collections: [{ id: 'col_1', name: 'Kyoto in autumn', placeIds: ['plc_1', 'plc_4'] }],
  inboxCount: 3,
  heartIds: [],
  savedViews: [],
}

const fetchMock = global.fetch as jest.Mock
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })

function flushHeld() {
  const actual = jest.requireActual('react') as typeof import('react')
  act(() => {
    const batch = pending.splice(0)
    if (!batch.length) return
    actual.startTransition(() => {
      for (const cb of batch) cb()
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  resetHeartWriterForTests()
  fetchMock.mockReset()
  fetchMock.mockImplementation(() => json({ status: 'success' }))
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/')
  holdTransitions = false
  pending.length = 0
})

describe('discrete filter transitions vs urgent search', () => {
  it('keeps typing as replaceState while a shelf click is still pending, then pushState for the shelf', async () => {
    holdTransitions = true
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const startLen = window.history.length
    await user.click(screen.getByRole('button', { name: /Planned\s*2/ }))
    expect(pending.length).toBeGreaterThan(0)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.type(input, 'a')
    await waitFor(() => expect(window.location.search).toContain('search=a'))
    expect(window.history.length).toBe(startLen)
    flushHeld()
    await waitFor(() => expect(window.location.search).toMatch(/visitStatus=planned/))
    expect(window.location.search).toContain('search=a')
    expect(window.history.length).toBe(startLen + 1)
    expect(input).toHaveValue('a')
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies a shelf over the latest search typed while the transition was pending', async () => {
    holdTransitions = true
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /Planned\s*2/ }))
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.type(input, 'Place')
    flushHeld()
    await waitFor(() => {
      expect(window.location.search).toMatch(/visitStatus=planned/)
      expect(window.location.search).toContain('search=Place')
    })
    expect(input).toHaveValue('Place')
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('pushState once for a shelf click when search follows under real startTransition', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const startLen = window.history.length
    await user.click(screen.getByRole('button', { name: /Planned\s*2/ }))
    await waitFor(() => expect(window.location.search).toMatch(/visitStatus=planned/))
    expect(window.history.length).toBe(startLen + 1)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.type(input, 'a')
    await waitFor(() => expect(window.location.search).toContain('search=a'))
    expect(window.location.search).toMatch(/visitStatus=planned/)
    expect(window.history.length).toBe(startLen + 1)
  })

  it('applies rapid Set chip removals from latest filters, not a stale snapshot', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.click(input)
    await user.type(input, 'itly')
    await user.click(within(await screen.findByRole('listbox')).getByText('Italy'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove filter 🇮🇹 Italy' })).toBeInTheDocument())
    await user.click(input)
    await user.clear(input)
    await user.type(input, 'japn')
    await user.click(within(await screen.findByRole('listbox')).getByText('Japan'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove filter 🇮🇹 Italy' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove filter 🇯🇵 Japan' })).toBeInTheDocument()
    })
    holdTransitions = true
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 🇮🇹 Italy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 🇯🇵 Japan' }))
    expect(pending.length).toBe(2)
    flushHeld()
    // Absolute Set patches from the same snapshot would leave one country chip.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Remove filter .*Italy/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Remove filter .*Japan/ })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Italy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Japan' })).toBeInTheDocument()
  })

  it('keeps Back URL when typing after popstate restores filters sync', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /Been\s*4/ }))
    await waitFor(() => expect(window.location.search).toMatch(/visitStatus=visited/))
    holdTransitions = true
    act(() => {
      window.history.replaceState(null, '', '/?visitStatus=planned')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(pending.length).toBe(0)
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'true')
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.type(input, 'a')
    await waitFor(() => expect(window.location.search).toContain('search=a'))
    expect(window.location.search).toMatch(/visitStatus=planned/)
    expect(window.location.search).not.toMatch(/visitStatus=visited/)
    expect(input).toHaveValue('a')
  })

  it('does not let a pending shelf transition undo Back', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /Been\s*4/ }))
    await waitFor(() => expect(window.location.search).toMatch(/visitStatus=visited/))
    const afterVisited = window.history.length
    holdTransitions = true
    await user.click(screen.getByRole('button', { name: /Planned\s*2/ }))
    expect(pending.length).toBeGreaterThan(0)
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Been\s*4/ })).toHaveAttribute('aria-pressed', 'false')
    flushHeld()
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/')
    })
    expect(window.location.search).not.toMatch(/visitStatus=planned/)
    expect(window.history.length).toBe(afterVisited)
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'false')
  })
})
