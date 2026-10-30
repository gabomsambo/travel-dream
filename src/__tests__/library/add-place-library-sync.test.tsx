import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddPlaceDialog } from '@/components/places/add-place-dialog'
import { LibrarySyncProvider } from '@/components/library/library-sync'
import { clearLibraryIndex, useLibraryIndex } from '@/lib/library/index-store'
import { encodeIndex } from '@/lib/library/wire'
import { item } from '../helpers/library-items'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/library',
}))

const fetchMock = global.fetch as jest.Mock
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
const created = { id: 'plc_new', name: 'Cafe Nuevo', kind: 'landmark', city: null, country: null, createdAt: '2026-10-31T10:00:00.000Z', coords: null }

function Count() {
  const { index } = useLibraryIndex('usr_1', 'v1')
  return <p data-testid="count">{index ? index.items.length : 'loading'}</p>
}

let stored = [item({ id: 'a' }), item({ id: 'b' })]
let version = 'v1'

beforeEach(() => {
  stored = [item({ id: 'a' }), item({ id: 'b' })]
  version = 'v1'
  clearLibraryIndex()
  refresh.mockClear()
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/places' && init?.method === 'POST') {
      stored = [...stored, item({ id: 'plc_new', name: 'Cafe Nuevo' })]
      version = 'v2'
      return json(created, 201)
    }
    if (url.startsWith('/api/library/index')) return json(JSON.parse(JSON.stringify(encodeIndex({ version, items: stored, collections: [] }))))
    if (url === '/api/library/version') return json({ version })
    return json({ places: [] })
  })
})

async function add(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/Name/), 'Cafe Nuevo')
  await user.click(screen.getByRole('button', { name: /^Add to Library$/ }))
}

describe('AddPlaceDialog and the Library on screen', () => {
  it('puts the new place into the cached index instead of rendering the page again', async () => {
    const user = userEvent.setup()
    render(
      <LibrarySyncProvider userId="usr_1">
        <Count />
        <AddPlaceDialog open onOpenChange={() => undefined} />
      </LibrarySyncProvider>
    )
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    await add(user)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3'))
    expect(refresh).not.toHaveBeenCalled()
    // The library is fetched again in the background and agrees.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v2'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(screen.getByTestId('count')).toHaveTextContent('3')
  })

  it('renders the page again when there is no Library on screen to patch', async () => {
    const user = userEvent.setup()
    render(<AddPlaceDialog open onOpenChange={() => undefined} />)
    await add(user)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })
})
