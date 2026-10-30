/** Hold discrete startTransition work so urgent search can interleave before it commits. */
const pending: Array<() => void> = []
let holdTransitions = false

jest.mock('react', () => {
  const actual = jest.requireActual('react') as typeof import('react')
  return {
    ...actual,
    startTransition: (cb: () => void) => {
      if (holdTransitions) pending.push(cb)
      else actual.startTransition(cb)
    },
  }
})

import { act, screen, waitFor } from '@testing-library/react'
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
  act(() => {
    const batch = pending.splice(0)
    for (const cb of batch) cb()
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
})
