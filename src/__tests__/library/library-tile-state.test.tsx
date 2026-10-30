import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryClient } from '@/components/library/library-client'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import type { LibraryData } from '@/lib/library/types'
import { item, photo } from '../helpers/library-items'
import { renderInMain as render, stubTallMain } from '../helpers/tall-main'

// Counts how often each place's tile renders, to hold the page to "one heart, one tile".
const tileRenders: Record<string, number> = {}
jest.mock('@/components/explore/place-tile', () => {
  const actual = jest.requireActual('@/components/explore/place-tile') as typeof import('@/components/explore/place-tile')
  return {
    ...actual,
    PlaceTile: (props: Parameters<typeof actual.PlaceTile>[0]) => {
      tileRenders[props.place.id] = (tileRenders[props.place.id] ?? 0) + 1
      return actual.PlaceTile(props)
    },
  }
})

stubTallMain()

const countries = ['Japan', 'Italy', 'Mexico']
const items = Array.from({ length: 14 }, (_, i) =>
  item({
    id: `plc_${i}`,
    name: `Place ${i}`,
    country: countries[i % 3],
    city: `City ${i % 3}`,
    photos: [photo],
    visitStatus: i < 4 ? 'visited' : i < 6 ? 'planned' : 'not_visited',
    createdAt: `2025-0${(i % 9) + 1}-01T00:00:00Z`,
  })
)
const data: LibraryData = { userId: 'usr_test', items, collections: [], inboxCount: 0, heartIds: [], savedViews: [] }

const fetchMock = global.fetch as jest.Mock

beforeEach(() => {
  localStorage.clear()
  resetHeartWriterForTests()
  fetchMock.mockReset()
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'success', placeIds: body.placeIds }) })
  })
  for (const key of Object.keys(tileRenders)) delete tileRenders[key]
  window.history.replaceState(null, '', '/')
})

/** Render counts per place since `snapshot`. */
const since = (snapshot: Record<string, number>) =>
  Object.fromEntries(Object.keys(tileRenders).map((id) => [id, tileRenders[id] - (snapshot[id] ?? 0)]))

describe('a place only re-renders for its own state', () => {
  it('hearting a place re-renders no tile, only its heart', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    expect(Object.keys(tileRenders).length).toBeGreaterThan(5)
    const before = { ...tileRenders }
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
    // The heart flips inside its own button: the tile around it, and every other tile, stay as they were.
    expect(Object.entries(since(before)).filter(([, n]) => n > 0)).toEqual([])
  })

  it('selecting a second place re-renders that tile and no other', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getAllByRole('checkbox', { name: 'Select Place 1' })[0])
    expect(screen.getAllByRole('checkbox', { name: 'Select Place 1' })[0]).toHaveAttribute('aria-checked', 'true')
    const before = { ...tileRenders }
    await user.click(screen.getAllByRole('checkbox', { name: 'Select Place 3' })[0])
    expect(screen.getAllByRole('checkbox', { name: 'Select Place 3' })[0]).toHaveAttribute('aria-checked', 'true')
    const delta = since(before)
    expect(delta.plc_3).toBeGreaterThan(0)
    expect(Object.entries(delta).filter(([id, n]) => id !== 'plc_3' && n > 0)).toEqual([])
  })

  it('turning Select mode on re-renders the tiles on screen, since every one shows its mark', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const before = { ...tileRenders }
    await user.keyboard('s')
    expect(await screen.findByText('Select places')).toBeInTheDocument()
    const delta = since(before)
    expect(Object.values(delta).filter((n) => n > 0).length).toBeGreaterThan(5)
  })
})
