import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseBestTime } from '@/lib/explore/best-time'
import type { ExplorePlace } from '@/lib/explore/types'
import { ExploreProvider } from '@/components/explore/explore-provider'
import { ShuffleDeck } from '@/components/explore/shuffle-deck'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import { notify } from '@/lib/notify'

jest.mock('framer-motion', () => {
  const React = require('react')
  const motion = new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        React.forwardRef(function MotionMock({ children, ...props }: { children?: React.ReactNode }, ref: unknown) {
          return React.createElement(prop === 'span' ? 'span' : 'div', { ...props, ref }, children)
        }),
    }
  )
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: () => ({ get: () => 0 }),
    useTransform: () => ({ get: () => 0 }),
    animate: jest.fn(),
  }
})

const place = (id: string, name: string): ExplorePlace => ({
  id,
  name,
  kind: 'landmark',
  city: 'Lisbon',
  country: 'Portugal',
  description: null,
  notes: null,
  vibes: [],
  bestTimeText: null,
  bestTime: parseBestTime(null, null),
  recommendedBy: null,
  visitStatus: 'not_visited',
  priority: 0,
  ratingSelf: 0,
  priceLevel: null,
  createdAt: '2024-01-01 00:00:00',
  lat: null,
  lon: null,
  photos: [{ uri: `https://example.com/${id}.jpg`, thumb: `https://example.com/${id}-t.jpg` }],
})

function renderDeck(deck: string[], collections: { id: string; name: string; placeIds: string[] }[] = []) {
  const places = deck.map((id, i) => place(id, `Place ${i + 1}`))
  return render(
    <ExploreProvider places={places} collections={collections}>
      <ShuffleDeck title="Everything" backHref="/explore" deck={deck} />
    </ExploreProvider>
  )
}

describe('ShuffleDeck', () => {
  beforeEach(() => {
    localStorage.clear()
    resetHeartWriterForTests()
    ;(global.fetch as jest.Mock)?.mockReset?.()
    jest.clearAllMocks()
  })

  it('Done early lands on the end screen with dreams kept', async () => {
    renderDeck(['a', 'b', 'c'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
    expect(screen.getByText(/1 dream out of 1/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save 1 as a new collection/i })).toBeInTheDocument()
  })

  it('undo of a dream keeps a Library favourite that predates the session', async () => {
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['a']))
    renderDeck(['a', 'b'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
    await userEvent.click(screen.getByRole('button', { name: /Back one/i }))
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toContain('a')
  })

  it('verdict keys are inert on the end screen after Done early', async () => {
    renderDeck(['a', 'b', 'c'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
    expect(screen.getByText(/1 dream out of 1/i)).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText(/1 dream out of 1/i)).toBeInTheDocument()
  })

  it('keeps the end screen when the page refreshes with a reshuffled deck', async () => {
    const places = ['a', 'b', 'c'].map((id, i) => place(id, `Place ${i + 1}`))
    const view = (deck: string[]) => (
      <ExploreProvider places={places} collections={[]}>
        <ShuffleDeck title="Everything" backHref="/explore" deck={deck} />
      </ExploreProvider>
    )
    const { rerender } = render(view(['a', 'b', 'c']))
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
    rerender(view(['c', 'a', 'b']))
    expect(screen.getByText(/1 dream out of 1/i)).toBeInTheDocument()
  })

  it('Enter on a focused Done button finishes instead of opening details', async () => {
    renderDeck(['a', 'b', 'c'])
    screen.getByRole('button', { name: 'Finish shuffle early' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText(/Nothing grabbed you/i)).toBeInTheDocument()
  })

  it('deck shortcuts stay quiet while a listbox is open', async () => {
    renderDeck(['a', 'b', 'c'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
    const listbox = document.createElement('div')
    listbox.setAttribute('role', 'listbox')
    document.body.appendChild(listbox)
    await userEvent.keyboard('z')
    listbox.remove()
    expect(screen.getByText(/1 dream out of 1/i)).toBeInTheDocument()
  })

  it('saves a dream to the account as well as this device', async () => {
    ;(global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ placeIds: ['a'] }) })
    )
    renderDeck(['a', 'b'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toContain('a')
    expect(global.fetch).toHaveBeenCalledWith('/api/library/hearts', expect.objectContaining({ method: 'POST', body: JSON.stringify({ placeIds: ['a'], on: true }) }))
  })

  it('puts a dream back and says so when the save fails', async () => {
    ;(global.fetch as jest.Mock).mockImplementation(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }))
    renderDeck(['a', 'b'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).not.toContain('a'))
    expect(notify.error).toHaveBeenCalledWith("Couldn't save that heart. Try again in a moment.")
  })

  it('keeps a device heart that was already there when saving it again fails', async () => {
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['a']))
    ;(global.fetch as jest.Mock).mockImplementation(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }))
    renderDeck(['a', 'b'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await waitFor(() => expect(notify.error).toHaveBeenCalled())
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toContain('a')
  })

  it('sends an undo only after the dream it follows, and leaves the place undreamed', async () => {
    let release!: (body: unknown) => void
    let heartsPosts = 0
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url !== '/api/library/hearts') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
      heartsPosts += 1
      if (heartsPosts === 1) {
        return new Promise((resolve) => {
          release = (body) => resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ placeIds: ['a'] }) })
    })
    renderDeck(['a', 'b'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await waitFor(() => expect(heartsPosts).toBe(1))
    await userEvent.keyboard('z')
    expect(heartsPosts).toBe(1)
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).not.toContain('a')
    release({ placeIds: ['a'] })
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.filter(([url]: [string]) => url === '/api/library/hearts').map(([, init]: [string, RequestInit]) => JSON.parse(String(init.body)))).toEqual([
        { placeIds: ['a'], on: true },
        { placeIds: ['a'], on: false },
      ])
    )
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).not.toContain('a')
  })

  describe('end screen collections', () => {
    beforeAll(() => {
      // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
      Element.prototype.hasPointerCapture ??= () => false
      Element.prototype.releasePointerCapture ??= () => {}
      Element.prototype.scrollIntoView ??= () => {}
    })

    const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    // Hearts are saved to the account as they happen; these tests are about the collection calls.
    const posts = () =>
      (global.fetch as jest.Mock).mock.calls
        .filter(([url]: [string]) => url !== '/api/library/hearts')
        .map(([url, init]: [string, RequestInit]) => ({
          url,
          body: JSON.parse(String(init.body)),
        }))

    async function dreamTwoThenDone() {
      await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
      await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
      expect(screen.getByText(/2 dreams out of 2/i)).toBeInTheDocument()
    }

    async function pickCollection(name: string) {
      await userEvent.click(screen.getByRole('combobox'))
      await userEvent.click(await screen.findByRole('option', { name }))
    }

    it('saves the dreams kept so far as a new collection', async () => {
      ;(global.fetch as jest.Mock).mockImplementation((url: string) =>
        url === '/api/collections' ? ok({ collection: { id: 'new1' } }) : ok({ results: { failed: [] } })
      )
      renderDeck(['a', 'b', 'c', 'd'])
      await dreamTwoThenDone()
      await userEvent.click(screen.getByRole('button', { name: /Save 2 as a new collection/i }))
      await userEvent.click(await screen.findByRole('button', { name: 'Save collection' }))
      expect(posts()).toEqual([
        { url: '/api/collections', body: expect.objectContaining({ name: expect.any(String) }) },
        { url: '/api/collections/new1/places', body: { placeIds: ['a', 'b'] } },
      ])
    })

    it('adds only the missing dreams to an existing collection and stays on the end screen', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(() => ok({ results: { failed: [] } }))
      renderDeck(['a', 'b', 'c'], [{ id: 'col1', name: 'Lisbon trip', placeIds: ['a'] }])
      await dreamTwoThenDone()
      await pickCollection('Lisbon trip')
      await userEvent.click(screen.getByRole('button', { name: 'Add places' }))
      expect(posts()).toEqual([{ url: '/api/collections/col1/places', body: { placeIds: ['b'] } }])
      expect(notify.success).toHaveBeenCalledWith('Added to Lisbon trip', expect.anything())
      expect(screen.getByText(/2 dreams out of 2/i)).toBeInTheDocument()
    })

    it('says so instead of silently doing nothing when every dream is already there', async () => {
      renderDeck(['a', 'b', 'c'], [{ id: 'col1', name: 'Lisbon trip', placeIds: ['a', 'b'] }])
      await dreamTwoThenDone()
      await pickCollection('Lisbon trip')
      await userEvent.click(screen.getByRole('button', { name: 'Add places' }))
      expect(posts()).toEqual([])
      expect(notify.info).toHaveBeenCalledWith('Already in Lisbon trip')
    })
  })
})
