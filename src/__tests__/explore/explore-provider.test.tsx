import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import { ExploreProvider, useExplore, type NewCollection } from '@/components/explore/explore-provider'

const push = jest.fn()
const mockedRouter = { push } as unknown as ReturnType<typeof useRouter>
jest.mock('next/navigation', () => ({
  useRouter: () => mockedRouter,
}))

const INPUT: NewCollection = { name: 'Tokyo trip', placeIds: ['p1', 'p2'], landing: 'planner' }

function SaveProbe() {
  const { createCollection } = useExplore()
  return (
    <button type="button" onClick={() => createCollection(INPUT)}>
      save
    </button>
  )
}

function renderProvider() {
  return render(
    <ExploreProvider places={[]} collections={[]}>
      <SaveProbe />
    </ExploreProvider>
  )
}

interface Call {
  url: string
  body: unknown
}

/** Every collection POST gets a fresh id; the first add to col_1 can be made to fail. */
function mockNetwork(opts: { failFirstAdd?: boolean } = {}) {
  const calls: Call[] = [];
  let created = 0;
  let addAttempts = 0;
  ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    if (url === '/api/collections') {
      created += 1
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ collection: { id: `col_${created}` } }) })
    }
    if (url.endsWith('/places')) {
      addAttempts += 1
      if (opts.failFirstAdd && addAttempts === 1) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      }
      return Promise.resolve({ ok: true, status: 207, json: async () => ({ results: { failed: [] } }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
  })
  return calls
}

describe('ExploreProvider.createCollection', () => {
  beforeEach(() => {
    push.mockReset()
    ;(notify.error as jest.Mock).mockReset()
    ;(notify.success as jest.Mock).mockReset()
  })

  it('finishes the collection it already made when the user saves again', async () => {
    const calls = mockNetwork({ failFirstAdd: true })
    renderProvider()

    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(notify.error).toHaveBeenCalled())
    // The collection exists on the server already; say so instead of a bare failure.
    expect(notify.error).toHaveBeenCalledWith(
      expect.stringContaining('was created, but its places'),
      expect.objectContaining({ description: expect.stringContaining('Save again') })
    )
    expect(push).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/collections/col_1/planner'))

    const created = calls.filter((c) => c.url === '/api/collections')
    expect(created).toHaveLength(1)
    expect(calls.filter((c) => c.url === '/api/collections/col_1/places')).toHaveLength(2)
    expect(calls.filter((c) => c.url === '/api/collections/col_2/places')).toHaveLength(0)
    expect(notify.success).toHaveBeenCalledWith('Tokyo trip is ready', expect.anything())
  })

  it('creates a second collection when a completed save is asked for again', async () => {
    const calls = mockNetwork()
    renderProvider()

    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/collections/col_1/planner'))
    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/collections/col_2/planner'))

    expect(calls.filter((c) => c.url === '/api/collections')).toHaveLength(2)
    expect(calls.filter((c) => c.url === '/api/collections/col_1/places')).toHaveLength(1)
    expect(calls.filter((c) => c.url === '/api/collections/col_2/places')).toHaveLength(1)
    expect(notify.error).not.toHaveBeenCalled()
  })

  it('does not leave a half-built collection behind when the create itself fails', async () => {
    const calls = mockNetwork()
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo) => {
      const url = String(input)
      calls.push({ url, body: undefined })
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
    })
    renderProvider()

    await userEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Couldn\'t create that collection. Try again in a moment.', undefined))
    expect(calls.filter((c) => c.url === '/api/collections')).toHaveLength(1)
    expect(push).not.toHaveBeenCalled()
  })
})