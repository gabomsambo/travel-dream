import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryClient } from '@/components/library/library-client'
import { resetHalfBuiltCollectionsForTests } from '@/components/library/library-add-to-collection'
import { resetHeartQueueForTests } from '@/lib/explore/dreams'
import { notify } from '@/lib/notify'
import type { LibraryData } from '@/lib/library/types'
import { item, photo } from '../helpers/library-items'

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

type Call = { url: string; method: string; body: unknown }
const fetchMock = global.fetch as jest.Mock
const calls = (): Call[] =>
  fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
    url,
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }))
const callsTo = (prefix: string) => calls().filter((c) => c.url.startsWith(prefix))
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })

/** A fetch that stays pending until the test lets it answer. */
function heldResponse() {
  let release!: (body: unknown, status?: number) => void
  const gate = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
    release = (body, status = 200) => resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  })
  return { gate, release }
}

/** Holds every hearts POST so a test can see which writes are in flight. */
function holdHeartPosts() {
  const pending: Array<{ body: { placeIds: string[]; on: boolean }; held: ReturnType<typeof heldResponse> }> = []
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url === '/api/library/hearts') {
      const held = heldResponse()
      pending.push({ body, held })
      return held.gate
    }
    return json({ status: 'success' })
  })
  return pending
}

/** A small fake of the API: hearts echo the ids they were sent, the rest answer success. */
function routeFetch(overrides: Record<string, (body: unknown) => unknown> = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    for (const [prefix, handler] of Object.entries(overrides)) if (url.startsWith(prefix)) return json(handler(body))
    if (url === '/api/library/hearts') return json({ status: 'success', placeIds: (body as { placeIds: string[] }).placeIds })
    if (url === '/api/library/views') return json({ status: 'success', view: { id: 'svw_1', ...(body as object) } }, 201)
    if (url === '/api/collections') return json({ collection: { id: 'col_new' } }, 201)
    if (url.endsWith('/places')) return json({ results: { successful: (body as { placeIds: string[] }).placeIds, failed: [] } })
    if (url === '/api/places/bulk-actions') return json({ status: 'success', result: { updatedCount: (body as { placeIds: string[] }).placeIds.length } })
    return json({ status: 'success' })
  })
}

beforeEach(() => {
  localStorage.clear()
  resetHeartQueueForTests()
  fetchMock.mockReset()
  routeFetch()
  jest.clearAllMocks()
  resetHalfBuiltCollectionsForTests()
  window.history.replaceState(null, '', '/')
  localStorage.setItem('td:hearts-synced:v1:usr_test', '1')
})

const tile = (name: string) => screen.getAllByRole('button', { name: new RegExp(`^${name},`) })[0]

describe('LibraryClient — build 1 structure', () => {
  it('opens on the journal cover, the shelves and country chapters', () => {
    render(<LibraryClient data={data} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Your atlas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Been\s*4/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Needs review/ })).toHaveAttribute('href', '/inbox')
    expect(screen.getByRole('heading', { level: 2, name: 'Japan' })).toBeInTheDocument()
    // The trips shelf renders twice — under the shelves, and after the first chapter on phones — with CSS showing one.
    for (const link of screen.getAllByRole('link', { name: /Kyoto in autumn/ })) expect(link).toHaveAttribute('href', '/collections/col_1')
  })

  it('opens the quick-look sheet on click, which leads to the Postcard — not the old tabbed dialog', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(tile('Place 3'))
    const sheet = await screen.findByRole('dialog', { name: 'Place 3' })
    expect(within(sheet).getByRole('link', { name: /Open place/ })).toHaveAttribute('href', '/place/plc_3')
    expect(within(sheet).queryByRole('tab')).not.toBeInTheDocument()
  })

  it('gives every card a working ⋯ menu, and Delete goes through the typed confirmation', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'More for Place 0' }))
    const menu = await screen.findByRole('menu')
    for (const label of [/Quick look/, /Open place/, /Heart it/, /Add to collection/, /Find image/, /Select/, /Archive/, /Delete/]) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    await user.click(within(menu).getByRole('menuitem', { name: /Delete/ }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByRole('button', { name: /Delete Permanently/ })).toBeDisabled()
    expect(callsTo('/api/places/bulk-actions')).toEqual([])
  })

  it('narrows to a shelf', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /Planned\s*2/ }))
    expect(screen.getByRole('button', { name: /Planned\s*2/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^Place 0,/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Place 4,/ }).length).toBeGreaterThan(0)
  })

  it('switches between the four views', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    for (const name of ['Gallery', 'Journal', 'Compact list', 'Map']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('radio', { name: 'Compact list' }))
    expect(screen.getAllByRole('table', { name: 'Places' }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('radio', { name: 'Journal' }))
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
  })

  it('counts a trip by the Library places it shows, not its Inbox or Archived members', () => {
    render(<LibraryClient data={{ ...data, collections: [{ id: 'col_1', name: 'Kyoto in autumn', placeIds: ['plc_1', 'plc_4', 'plc_inbox'] }] }} />)
    for (const link of screen.getAllByRole('link', { name: /Kyoto in autumn/ })) {
      expect(link).toHaveTextContent('2 places')
      expect(link).not.toHaveTextContent('3 places')
    }
  })

  it('drops a city chip that a shelf change leaves empty, instead of an empty chapter', async () => {
    const user = userEvent.setup()
    const japan = [
      item({ id: 'k1', name: 'Kinkaku', country: 'Japan', city: 'Kyoto', photos: [photo], visitStatus: 'not_visited' }),
      item({ id: 'k2', name: 'Fushimi', country: 'Japan', city: 'Kyoto', photos: [photo], visitStatus: 'not_visited' }),
      item({ id: 't1', name: 'Senso-ji', country: 'Japan', city: 'Tokyo', photos: [photo], visitStatus: 'visited', lastVisited: '2024-04-12' }),
    ]
    render(<LibraryClient data={{ ...data, items: [...items, ...japan], collections: [] }} />)
    await user.click(screen.getByRole('button', { name: /^Kyoto\s*2$/ }))
    expect(screen.queryByRole('button', { name: /^Senso-ji,/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Been\s*5/ }))
    expect(screen.getAllByRole('button', { name: /^Senso-ji,/ }).length).toBeGreaterThan(0)
  })
})

describe('hearts, saved to the account', () => {
  it('hearts a place on the account and on this device, for Shuffle', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    expect(callsTo('/api/library/hearts')).toEqual([{ url: '/api/library/hearts', method: 'POST', body: { placeIds: ['plc_2'], on: true } }])
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toEqual(['plc_2'])
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('rolls a heart back and says so when the save fails', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(() => json({ status: 'error' }, 500))
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false'))
    expect(notify.error).toHaveBeenCalled()
  })

  it("syncs this device's old hearts to the account once, keeping only what the server accepts", async () => {
    localStorage.removeItem('td:hearts-synced:v1:usr_test')
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['plc_2', 'plc_gone']))
    routeFetch({ '/api/library/hearts': () => ({ status: 'success', placeIds: ['plc_2'] }) })
    const { unmount } = render(<LibraryClient data={{ ...data, heartIds: ['plc_7'] }} />)
    await waitFor(() => expect(localStorage.getItem('td:hearts-synced:v1:usr_test')).toBe('1'))
    expect(callsTo('/api/library/hearts')).toEqual([
      { url: '/api/library/hearts', method: 'POST', body: { placeIds: ['plc_2', 'plc_gone'], on: true } },
    ])
    // The device now mirrors the account: its own heart, the synced one, not the unknown id.
    expect(new Set(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]'))).toEqual(new Set(['plc_7', 'plc_2']))
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toBeInTheDocument()
    unmount()

    fetchMock.mockClear()
    render(<LibraryClient data={{ ...data, heartIds: ['plc_7', 'plc_2'] }} />)
    await act(async () => undefined)
    expect(callsTo('/api/library/hearts')).toEqual([])
  })

  it('leaves the device copy alone when the one-time sync fails, to try again next time', async () => {
    localStorage.removeItem('td:hearts-synced:v1:usr_test')
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['plc_2']))
    fetchMock.mockImplementation(() => json({ status: 'error' }, 503))
    render(<LibraryClient data={data} />)
    await waitFor(() => expect(callsTo('/api/library/hearts').length).toBe(1))
    await act(async () => undefined)
    expect(localStorage.getItem('td:hearts-synced:v1:usr_test')).toBeNull()
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toEqual(['plc_2'])
  })

  it('replays a heart a dropped request left queued', async () => {
    localStorage.setItem('td:hearts-pending:v1', JSON.stringify({ plc_3: true, plc_7: false }))
    render(<LibraryClient data={{ ...data, heartIds: ['plc_7'] }} />)
    await waitFor(() => expect(callsTo('/api/library/hearts').length).toBe(2))
    expect(callsTo('/api/library/hearts').map((c) => c.body)).toEqual([
      { placeIds: ['plc_3'], on: true },
      { placeIds: ['plc_7'], on: false },
    ])
    expect(localStorage.getItem('td:hearts-pending:v1')).toBeNull()
  })

  it('keeps a heart toggled while the first sync is still saving', async () => {
    localStorage.removeItem('td:hearts-synced:v1:usr_test')
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['plc_2']))
    const sync = heldResponse()
    let heartsPosts = 0
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url === '/api/library/hearts') {
        heartsPosts += 1
        if (heartsPosts === 1) return sync.gate
        return json({ status: 'success', placeIds: body.placeIds })
      }
      return json({ status: 'success' })
    })
    const user = userEvent.setup()
    render(<LibraryClient data={{ ...data, heartIds: ['plc_7'] }} />)
    await waitFor(() => expect(heartsPosts).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Heart Place 3' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove heart from Place 3' })).toHaveAttribute('aria-pressed', 'true'))
    await act(async () => {
      sync.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(localStorage.getItem('td:hearts-synced:v1:usr_test')).toBe('1'))
    expect(screen.getByRole('button', { name: 'Remove heart from Place 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(new Set(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]'))).toEqual(new Set(['plc_7', 'plc_2', 'plc_3']))
  })

  it('keeps an un-heart made while the first sync is still saving', async () => {
    localStorage.removeItem('td:hearts-synced:v1:usr_test')
    localStorage.setItem('travel-dreams-favorites', JSON.stringify(['plc_2', 'plc_gone']))
    const sync = heldResponse()
    let heartsPosts = 0
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url === '/api/library/hearts') {
        heartsPosts += 1
        if (heartsPosts === 1) return sync.gate
        return json({ status: 'success', placeIds: body.placeIds })
      }
      return json({ status: 'success' })
    })
    const user = userEvent.setup()
    render(<LibraryClient data={{ ...data, heartIds: ['plc_7'] }} />)
    await waitFor(() => expect(heartsPosts).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 7' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Heart Place 7' })).toHaveAttribute('aria-pressed', 'false'))
    await act(async () => {
      sync.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(localStorage.getItem('td:hearts-synced:v1:usr_test')).toBe('1'))
    expect(screen.getByRole('button', { name: 'Heart Place 7' })).toHaveAttribute('aria-pressed', 'false')
    const stored = new Set<string>(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]'))
    expect(stored.has('plc_7')).toBe(false)
    expect(stored.has('plc_2')).toBe(true)
    expect(stored.has('plc_gone')).toBe(false)
  })

  it('sends a later un-heart only after the heart it follows, and leaves the place unhearted', async () => {
    const first = heldResponse()
    let heartsPosts = 0
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url === '/api/library/hearts') {
        heartsPosts += 1
        if (heartsPosts === 1) return first.gate
        return json({ status: 'success', placeIds: body.placeIds })
      }
      return json({ status: 'success' })
    })
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    await waitFor(() => expect(heartsPosts).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 2' }))
    expect(heartsPosts).toBe(1)
    expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false')
    await act(async () => {
      first.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(callsTo('/api/library/hearts').map((c) => c.body)).toEqual([
      { placeIds: ['plc_2'], on: true },
      { placeIds: ['plc_2'], on: false },
    ]))
    expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not let a failed earlier heart undo a later one', async () => {
    const first = heldResponse()
    let heartsPosts = 0
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url === '/api/library/hearts') {
        heartsPosts += 1
        if (heartsPosts === 1) return first.gate
        return json({ status: 'success', placeIds: body.placeIds })
      }
      return json({ status: 'success' })
    })
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    await waitFor(() => expect(heartsPosts).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 2' }))
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    expect(heartsPosts).toBe(1)
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
    await act(async () => {
      first.release({ status: 'error' }, 500)
    })
    await waitFor(() => expect(callsTo('/api/library/hearts').map((c) => c.body)).toEqual([
      { placeIds: ['plc_2'], on: true },
      { placeIds: ['plc_2'], on: false },
      { placeIds: ['plc_2'], on: true },
    ]))
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(notify.error).not.toHaveBeenCalled()
  })

  it('applies a heart made during replay after the queued un-heart, not before it', async () => {
    localStorage.setItem('td:hearts-pending:v1', JSON.stringify({ plc_3: true, plc_7: false }))
    const pending = holdHeartPosts()
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await waitFor(() => expect(pending.map((p) => p.body)).toEqual([
      { placeIds: ['plc_3'], on: true },
      { placeIds: ['plc_7'], on: false },
    ]))
    await user.click(screen.getByRole('button', { name: 'Heart Place 7' }))
    expect(pending).toHaveLength(2)
    await act(async () => {
      pending[0].held.release({ status: 'success', placeIds: ['plc_3'] })
      pending[1].held.release({ status: 'success', placeIds: ['plc_7'] })
    })
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].body).toEqual({ placeIds: ['plc_7'], on: true })
    await act(async () => {
      pending[2].held.release({ status: 'success', placeIds: ['plc_7'] })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove heart from Place 7' })).toHaveAttribute('aria-pressed', 'true'))
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toContain('plc_7')
  })

  it('does not let a later queued batch overwrite a heart changed while an earlier batch is still saving', async () => {
    const extras = Array.from({ length: 500 }, (_, i) => `x${i}`)
    localStorage.setItem('td:hearts-pending:v1', JSON.stringify(Object.fromEntries([...extras, 'plc_2'].map((id) => [id, true]))))
    const pending = holdHeartPosts()
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[0].body.placeIds).toHaveLength(500)
    expect(pending[1].body).toEqual({ placeIds: ['plc_2'], on: true })
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 2' }))
    expect(pending).toHaveLength(2)
    await act(async () => {
      pending[0].held.release({ status: 'success', placeIds: pending[0].body.placeIds })
      pending[1].held.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].body).toEqual({ placeIds: ['plc_2'], on: true })
    await act(async () => {
      pending[2].held.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(pending).toHaveLength(4))
    expect(pending[3].body).toEqual({ placeIds: ['plc_2'], on: false })
    await act(async () => {
      pending[3].held.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false'))
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).not.toContain('plc_2')
  })

  it('does not keep a heart on screen when hearting and un-hearting both fail', async () => {
    const first = heldResponse()
    let heartsPosts = 0
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/library/hearts') {
        heartsPosts += 1
        if (heartsPosts === 1) return first.gate
        return json({ status: 'error' }, 500)
      }
      return json({ status: 'success' })
    })
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    await waitFor(() => expect(heartsPosts).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 2' }))
    await act(async () => {
      first.release({ status: 'error' }, 500)
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false'))
    expect(notify.error).toHaveBeenCalledWith("Couldn't remove that heart. Try again in a moment.")
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).not.toContain('plc_2')
  })

  it('keeps a heart the server stored when later toggles of it fail', async () => {
    const first = heldResponse()
    let heartsPosts = 0
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/library/hearts') {
        heartsPosts += 1
        if (heartsPosts === 1) return first.gate
        return json({ status: 'error' }, 500)
      }
      return json({ status: 'success' })
    })
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    await waitFor(() => expect(heartsPosts).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 2' }))
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    expect(heartsPosts).toBe(1)
    await act(async () => {
      first.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("Couldn't save that heart. Try again in a moment."))
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toContain('plc_2')
  })

  it('does not let a failed replay put an un-heart back over a heart that landed after it', async () => {
    localStorage.setItem('td:hearts-pending:v1', JSON.stringify({ plc_2: false }))
    const pending = holdHeartPosts()
    const user = userEvent.setup()
    const { unmount } = render(<LibraryClient data={data} />)
    await waitFor(() => expect(pending.map((p) => p.body)).toEqual([{ placeIds: ['plc_2'], on: false }]))
    await user.click(screen.getByRole('button', { name: 'Heart Place 2' }))
    expect(pending).toHaveLength(1)
    await act(async () => {
      pending[0].held.release({ status: 'error' }, 503)
    })
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].body).toEqual({ placeIds: ['plc_2'], on: true })
    await act(async () => {
      pending[1].held.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true'))
    expect(localStorage.getItem('td:hearts-pending:v1')).toBeNull()
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).toContain('plc_2')
    unmount()

    fetchMock.mockClear()
    routeFetch()
    render(<LibraryClient data={{ ...data, heartIds: ['plc_2'] }} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(callsTo('/api/library/hearts')).toEqual([])
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps a replayed un-heart when the un-heart that followed it fails', async () => {
    localStorage.setItem('td:hearts-pending:v1', JSON.stringify({ plc_2: false }))
    const pending = holdHeartPosts()
    const user = userEvent.setup()
    render(<LibraryClient data={{ ...data, heartIds: ['plc_2'] }} />)
    await waitFor(() => expect(pending.map((p) => p.body)).toEqual([{ placeIds: ['plc_2'], on: false }]))
    expect(screen.getByRole('button', { name: 'Remove heart from Place 2' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Remove heart from Place 2' }))
    expect(pending).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false')
    await act(async () => {
      pending[0].held.release({ status: 'success', placeIds: ['plc_2'] })
    })
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].body).toEqual({ placeIds: ['plc_2'], on: false })
    await act(async () => {
      pending[1].held.release({ status: 'error' }, 500)
    })
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("Couldn't remove that heart. Try again in a moment."))
    expect(screen.getByRole('button', { name: 'Heart Place 2' })).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(localStorage.getItem('travel-dreams-favorites') ?? '[]')).not.toContain('plc_2')
  })

  it('shows a Hearts shelf once there is a heart, and narrows to them', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<LibraryClient data={data} />)
    expect(screen.queryByRole('button', { name: /^Hearts/ })).not.toBeInTheDocument()
    rerender(<LibraryClient data={{ ...data, heartIds: ['plc_5', 'plc_inbox'] }} />)
    await user.click(screen.getByRole('button', { name: /^Hearts\s*1/ }))
    expect(screen.getAllByRole('button', { name: /^Place 5,/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Place 4,/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?hearts=1')
  })
})

describe('command-bar search', () => {
  it('lists matches as you type; ↓ and Enter open the quick look', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.click(input)
    await user.type(input, 'Place 3')
    const list = await screen.findByRole('listbox', { name: 'Search results' })
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent('Place 3')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Place 3' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('td:library-recent-searches:v1') ?? '[]')).toEqual(['Place 3'])
  })

  it('turns words into a real filter from a suggestion', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.click(input)
    await user.type(input, 'itly')
    const suggestion = within(await screen.findByRole('listbox')).getByRole('option', { name: /Country · Italy/ })
    await user.click(within(suggestion).getByText('Italy'))
    expect(screen.getByRole('button', { name: 'Remove filter 🇮🇹 Italy' })).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(screen.queryByRole('heading', { level: 2, name: 'Japan' })).not.toBeInTheDocument()
  })

  it('focuses on ⌘K and /, outside a text field', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.keyboard('{Control>}k{/Control}')
    expect(input).toHaveFocus()
    input.blur()
    await user.keyboard('/')
    expect(input).toHaveFocus()
  })

  it('counts a filter suggestion for the shelf in view, not the whole library', async () => {
    const cafes = Array.from({ length: 12 }, (_, i) =>
      item({ id: `cafe_${i}`, name: `Spot ${i}`, kind: 'cafe', country: 'Italy', city: 'Rome', photos: [photo] }),
    )
    const user = userEvent.setup()
    render(<LibraryClient data={{ ...data, items: cafes, collections: [], heartIds: ['cafe_0'] }} />)
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.click(input)
    await user.type(input, 'cafe')
    expect(within(await screen.findByRole('listbox', { name: 'Search results' })).getByRole('option', { name: /Kind · Cafe/ })).toHaveTextContent('Filter to 12 places')
    await user.click(screen.getByRole('button', { name: /^Hearts\s*1/ }))
    await user.click(input)
    const suggestion = within(await screen.findByRole('listbox', { name: 'Search results' })).getByRole('option', { name: /Kind · Cafe/ })
    expect(suggestion).toHaveTextContent('Filter to 1 place')
    expect(suggestion).not.toHaveTextContent('12')
    await user.click(within(suggestion).getByText('Cafe'))
    expect(screen.getAllByRole('button', { name: /^Spot 0,/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Spot 1,/ })).not.toBeInTheDocument()
  })

  it('counts the places on the page when a shelf narrows the search', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={{ ...data, heartIds: ['plc_0'] }} />)
    await user.click(screen.getByRole('button', { name: /^Hearts\s*1/ }))
    const input = screen.getByRole('combobox', { name: 'Search your library' })
    await user.click(input)
    await user.type(input, 'Place')
    const line = await screen.findByText(/the page below already shows 1 match/, { selector: 'p' })
    expect(line).toHaveTextContent('search all places')
    expect(screen.queryByText(/the page below already shows 14 matches/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Place 0,/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Place 4,/ })).not.toBeInTheDocument()
  })

  it('lets ⌘K and / through when the library has no search field', async () => {
    const user = userEvent.setup()
    const got: string[] = []
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) got.push(e.defaultPrevented ? 'slash-blocked' : 'slash')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') got.push(e.defaultPrevented ? 'k-blocked' : 'k')
    }
    document.addEventListener('keydown', onKey)
    try {
      render(<LibraryClient data={{ ...data, items: [], collections: [], inboxCount: 0, heartIds: [] }} />)
      expect(screen.queryByRole('combobox', { name: 'Search your library' })).not.toBeInTheDocument()
      await user.keyboard('{Control>}k{/Control}')
      await user.keyboard('/')
      expect(got).toEqual(['k', 'slash'])
    } finally {
      document.removeEventListener('keydown', onKey)
    }
  })
})

describe('Select mode and the bulk bar', () => {
  it('selects a range with shift-click in reading order and shows the bulk bar', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /^Select$/ }))
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' })
    // The range follows the page as it reads: the first and fourth places on it.
    const onPage = screen.getAllByRole('button').filter((b) => b.dataset.placeId)
    await user.click(onPage[0])
    await user.keyboard('{Shift>}')
    await user.click(onPage[3])
    await user.keyboard('{/Shift}')
    expect(within(bar).getByText('4 selected')).toBeInTheDocument()
    for (const b of onPage.slice(0, 4)) expect(screen.getByRole('checkbox', { name: `Select ${b.getAttribute('aria-label')!.split(',')[0]}` })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('sets a status on the selection, and Undo puts each back the way it was', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.keyboard('s')
    await user.click(tile('Place 0'))
    await user.click(tile('Place 6'))
    await user.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: /Set status/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Been/ }))
    await waitFor(() => expect(callsTo('/api/places/bulk-actions').length).toBe(1))
    // Place 0 was already Been, so only Place 6 changes.
    expect(callsTo('/api/places/bulk-actions')[0].body).toEqual({ action: 'set-visit-status', placeIds: ['plc_6'], visitStatus: 'visited' })
    const [, opts] = (notify.success as jest.Mock).mock.calls.find(([m]) => String(m).startsWith('Marked'))!
    await act(async () => opts.cancel.onClick())
    await waitFor(() => expect(callsTo('/api/places/bulk-actions').length).toBe(2))
    expect(callsTo('/api/places/bulk-actions')[1].body).toEqual({ action: 'set-visit-status', placeIds: ['plc_6'], visitStatus: 'not_visited' })
  })

  it('archives with an Undo that restores', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.keyboard('s')
    await user.click(tile('Place 3'))
    await user.keyboard('a')
    await waitFor(() => expect(callsTo('/api/places/bulk-actions')[0]?.body).toEqual({ action: 'archive', placeIds: ['plc_3'] }))
    const [, opts] = (notify.success as jest.Mock).mock.calls.find(([m]) => String(m).startsWith('Archived'))!
    await act(async () => opts.cancel.onClick())
    await waitFor(() => expect(callsTo('/api/places/bulk-actions')[1]?.body).toEqual({ action: 'restore', placeIds: ['plc_3'] }))
  })
})

describe('Add to collection', () => {
  it('adds only the places a collection does not have yet, and Undo takes exactly those out', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.keyboard('s')
    await user.click(tile('Place 1'))
    await user.click(tile('Place 7'))
    await user.keyboard('c')
    const dialog = await screen.findByRole('dialog', { name: /Add 2 places to a collection/ })
    expect(within(dialog).getByText(/has 1 of these/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Kyoto in autumn/ }))
    await waitFor(() => expect(callsTo('/api/collections/col_1/places')).toEqual([
      { url: '/api/collections/col_1/places', method: 'POST', body: { placeIds: ['plc_7'] } },
    ]))
    const [message, opts] = (notify.success as jest.Mock).mock.calls.find(([m]) => String(m).startsWith('Added'))!
    expect(message).toBe('Added 1 to Kyoto in autumn')
    expect(opts.description).toBe('1 added · 1 was already there')
    await act(async () => opts.cancel.onClick())
    await waitFor(() => expect(calls().some((c) => c.url === '/api/collections/col_1/places/plc_7' && c.method === 'DELETE')).toBe(true))
  })

  it('creates a new collection inline, named after the places, and a retry never makes a second copy', async () => {
    const user = userEvent.setup()
    let failAdd = true
    routeFetch({})
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url === '/api/collections') return json({ collection: { id: 'col_new' } }, 201)
      if (url === '/api/collections/col_new/places') return failAdd ? json({ status: 'error' }, 500) : json({ results: { successful: body.placeIds, failed: [] } })
      return json({ status: 'success', placeIds: [] })
    })
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: 'More for Place 2' }))
    await user.click(await screen.findByRole('menuitem', { name: /Add to collection/ }))
    const dialog = await screen.findByRole('dialog', { name: /Add Place 2 to a collection/ })
    expect(within(dialog).getByLabelText('New collection name')).toHaveValue('City 2 trip')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('City 2 trip was created, but the places didn\'t save to it.', expect.anything()))
    failAdd = false
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Added 1 to City 2 trip', expect.anything()))
    expect(callsTo('/api/collections').filter((c) => c.url === '/api/collections').length).toBe(1)
  })
})

describe('smart shelves and saved views', () => {
  it('"No collection" narrows to unfiled places, and the view saves to the account', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={data} />)
    await user.click(screen.getByRole('button', { name: /No collection\s*12/ }))
    expect(screen.queryByRole('button', { name: /^Place 1,/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?uncollected=1')
    await user.click(screen.getByRole('button', { name: /Save view/ }))
    const name = await screen.findByLabelText('Name this view')
    expect(name).toHaveValue('Not in a collection')
    await user.clear(name)
    await user.type(name, 'To file{Enter}')
    await waitFor(() => expect(callsTo('/api/library/views')).toEqual([
      { url: '/api/library/views', method: 'POST', body: { name: 'To file', query: 'uncollected=1' } },
    ]))
    expect(await screen.findByRole('button', { name: 'To file', pressed: true })).toBeInTheDocument()
  })

  it('applies a saved view in one tap', async () => {
    const user = userEvent.setup()
    render(<LibraryClient data={{ ...data, savedViews: [{ id: 'svw_1', name: 'Italy planned', query: 'country=Italy&visitStatus=planned' }] }} />)
    await user.click(screen.getByRole('button', { name: 'Italy planned' }))
    expect(window.location.search).toBe('?country=Italy&visitStatus=planned')
    expect(screen.getByRole('button', { name: 'Italy planned' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /^Place 4,/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Place 5,/ })).not.toBeInTheDocument()
  })
})
