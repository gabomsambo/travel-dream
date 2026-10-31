import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryIndexed } from '@/components/library/library-indexed'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import { buildFirstScreen } from '@/lib/library/first-screen'
import { clearLibraryIndex } from '@/lib/library/index-store'
import { notify } from '@/lib/notify'
import { useLibrarySync } from '@/components/library/library-sync'
import { itemOfPlace } from '@/lib/library/index-patch'
import { encodeIndex } from '@/lib/library/wire'
import { item, photo } from '../helpers/library-items'
import { renderInMain as render, stubTallMain } from '../helpers/tall-main'

// Stand-ins for the two dialogs that talk to their own routes; what matters here is what the page does with their results.
jest.mock('@/components/places/find-image-dialog', () => ({
  FindImageDialog: ({ placeId, open, onAttached }: { placeId: string; open: boolean; onAttached?: (a: unknown) => void }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onAttached?.({
            deduped: false,
            attachment: { uri: 'https://images.pexels.com/new.jpg', thumbnailUri: 'https://images.pexels.com/new-t.jpg', attribution: null, source: 'pexels', isPrimary: 1, placeId },
          })
        }
      >
        Attach found image
      </button>
    ) : null,
}))

stubTallMain()

const NOW = new Date('2026-10-30T12:00:00Z')
const fetchMock = global.fetch as jest.Mock
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/library',
}))

const items = Array.from({ length: 200 }, (_, i) =>
  item({
    id: `plc_${i}`,
    name: `Place ${i}`,
    country: 'Japan',
    city: `City ${i % 4}`,
    photos: i % 7 === 0 ? [] : [photo],
    visitStatus: i < 3 ? 'visited' : 'not_visited',
    createdAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
  })
)
const collections = [{ id: 'col_1', name: 'Trip', description: null, placeIds: ['plc_2'] }]
const seed = buildFirstScreen({ userId: 'usr_test', version: 'v1', items, collections, inboxCount: 2, heartIds: [], savedViews: [], params: new URLSearchParams(), now: NOW })

// Places the first screen shows, which the full page shows too: tiles that are on screen to click.
const [A, B] = seed.chapters[0].items.filter((p) => p.visitStatus === 'not_visited').map((p) => p.id)
// A place on the first screen with no photo yet, the one "Find image" is offered for.
const C = seed.chapters[0].items.find((p) => p.photos.length === 0)!.id
const nameOf = (id: string) => items.find((p) => p.id === id)!.name

const tile = (id: string) => document.querySelector<HTMLElement>(`[data-place-id="${id}"]`)
const total = (n: number) => screen.queryByText(`${n} places`, { selector: 'p.sr-only' })
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
const body = (version: string, list: typeof items, cols = collections) => JSON.parse(JSON.stringify(encodeIndex({ version, items: list, collections: cols })))
const urls = () => fetchMock.mock.calls.map(([u]) => String(u))
const bulkCalls = () => fetchMock.mock.calls.filter(([u]) => u === '/api/places/bulk-actions').map(([, init]) => JSON.parse(String(init.body)))

/** What the server holds, and what it answers. `bulk` decides each bulk-actions call. */
const server = {
  version: 'v1',
  items,
  collections,
  bulk: (_: unknown): Promise<unknown> => json({ status: 'success', result: { updatedCount: 1 } }),
}

beforeEach(() => {
  localStorage.clear()
  resetHeartWriterForTests()
  clearLibraryIndex()
  fetchMock.mockReset()
  refresh.mockClear()
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/')
  Object.assign(server, { version: 'v1', items, collections, bulk: () => json({ status: 'success', result: { updatedCount: 1 } }) })
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/places/bulk-actions') return server.bulk(JSON.parse(String(init?.body)))
    if (url === '/api/library/version') return json({ version: server.version })
    if (url.startsWith('/api/library/index')) return json(body(server.version, server.items, server.collections))
    return json({ status: 'success' })
  })
})

async function open() {
  const view = render(<LibraryIndexed seed={seed} />)
  await screen.findByPlaceholderText('Search your atlas…')
  fetchMock.mockClear()
  return view
}

/** The server has taken an archive of `ids`: it moves to a new version. */
const serverArchived = (ids: string[]) => {
  server.version = 'v2'
  server.items = items.filter((p) => !ids.includes(p.id))
}

describe('Library edits on an indexed library', () => {
  it('archives on screen at once, without reloading the page, then checks the library in the background', async () => {
    const user = userEvent.setup()
    await open()
    expect(total(200)).toBeInTheDocument()
    expect(tile(A)).toBeInTheDocument()

    let answer!: () => void
    server.bulk = () => new Promise((resolve) => (answer = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'success', result: { updatedCount: 1 } }) })))
    await user.keyboard('s')
    await user.click(tile(A)!)
    await user.keyboard('a')

    // The server has not answered; the page already has.
    await waitFor(() => expect(total(199)).toBeInTheDocument())
    expect(tile(A)).not.toBeInTheDocument()
    expect(urls()).not.toContain('/api/library/version')

    serverArchived([A])
    await act(async () => answer())
    await waitFor(() => expect(urls()).toContain('/api/library/index?v=v2'))
    expect(urls().filter((u) => u.startsWith('/api/library/index'))).toEqual(['/api/library/index?v=v2'])
    expect(refresh).not.toHaveBeenCalled()
    expect(bulkCalls()).toEqual([{ action: 'archive', placeIds: [A] }])
    expect(total(199)).toBeInTheDocument()
    expect(tile(A)).not.toBeInTheDocument()
  })

  it('puts the place back and says why when the archive is refused', async () => {
    const user = userEvent.setup()
    await open()
    server.bulk = () => json({ status: 'error', message: 'The server said no' }, 500)

    await user.keyboard('s')
    await user.click(tile(A)!)
    await user.keyboard('a')

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('The server said no'))
    expect(total(200)).toBeInTheDocument()
    expect(tile(A)).toBeInTheDocument()
    // Nothing moved on the server: the version is asked for, the library is not downloaded.
    await waitFor(() => expect(urls()).toContain('/api/library/version'))
    expect(urls().some((u) => u.startsWith('/api/library/index'))).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Undo shows the place again at once, and rolls back if the restore is refused', async () => {
    const user = userEvent.setup()
    await open()
    serverArchived([A])
    await user.keyboard('s')
    await user.click(tile(A)!)
    await user.keyboard('a')
    await waitFor(() => expect(total(199)).toBeInTheDocument())

    const [, opts] = (notify.success as jest.Mock).mock.calls.find(([m]) => String(m).startsWith('Archived'))!
    let answer!: (status: number) => void
    server.bulk = () => new Promise((resolve) => (answer = (status) => resolve({ ok: status < 400, status, json: () => Promise.resolve({ message: 'No restore' }) })))
    act(() => {
      opts.cancel.onClick()
    })
    await waitFor(() => expect(total(200)).toBeInTheDocument())
    expect(tile(A)).toBeInTheDocument()

    await act(async () => answer(500))
    await waitFor(() => expect(total(199)).toBeInTheDocument())
    expect(notify.error).toHaveBeenCalledWith('No restore')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('marks a status on screen at once and puts it back if refused', async () => {
    const user = userEvent.setup()
    await open()
    const been = () => screen.getByRole('button', { name: /^Been\s*(\d+)/ }).textContent
    expect(been()).toMatch(/3/)

    server.bulk = () => json({ message: 'Nope' }, 500)
    await user.keyboard('s')
    await user.click(tile(B)!)
    await user.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: /Set status/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Been/ }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Nope'))
    expect(been()).toMatch(/3/)
    expect(bulkCalls()).toEqual([{ action: 'set-visit-status', placeIds: [B], visitStatus: 'visited' }])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps a status change once the server has it', async () => {
    const user = userEvent.setup()
    await open()
    server.version = 'v2'
    server.items = items.map((p) => (p.id === B ? { ...p, visitStatus: 'visited' as const } : p))

    await user.keyboard('s')
    await user.click(tile(B)!)
    await user.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: /Set status/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Been/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: /^Been\s*4/ })).toBeInTheDocument())
    await waitFor(() => expect(urls()).toContain('/api/library/index?v=v2'))
    expect(screen.getByRole('button', { name: /^Been\s*4/ })).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('removes a deleted place at once and brings it back if the delete fails', async () => {
    const user = userEvent.setup()
    await open()
    server.bulk = () => json({ message: 'Cannot delete' }, 500)

    await user.click(screen.getAllByRole('button', { name: `More for ${nameOf(A)}` })[0])
    await user.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    const confirm = await screen.findByRole('alertdialog')
    await user.type(within(confirm).getByLabelText(/Type/), 'confirm')
    await user.click(within(confirm).getByRole('button', { name: /Delete Permanently/ }))

    await waitFor(() => expect(notify.errorPersistent).toHaveBeenCalledWith('Cannot delete'))
    expect(total(200)).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows a photo found for a place without reloading the page', async () => {
    const user = userEvent.setup()
    await open()
    server.version = 'v2'
    server.items = items.map((p) => (p.id === C ? { ...p, photos: [{ uri: 'https://images.pexels.com/new.jpg', thumb: 'https://images.pexels.com/new-t.jpg' }] } : p))
    const coverOf = () => decodeURIComponent(tile(C)?.parentElement?.querySelector('img')?.getAttribute('src') ?? '')
    expect(coverOf()).not.toContain('images.pexels.com')

    await user.click(screen.getAllByRole('button', { name: `More for ${nameOf(C)}` })[0])
    await user.click(await screen.findByRole('menuitem', { name: /Find image/ }))
    await user.click(await screen.findByRole('button', { name: 'Attach found image' }))

    await waitFor(() => expect(coverOf()).toContain('images.pexels.com/new'))
    expect(refresh).not.toHaveBeenCalled()
    await waitFor(() => expect(urls()).toContain('/api/library/index?v=v2'))
    expect(coverOf()).toContain('images.pexels.com/new')
  })

  it('takes a place added from outside the page, like the header’s Add place, straight in', async () => {
    const added = { id: 'plc_added', name: 'Added Cafe', kind: 'cafe', city: 'Kyoto', country: 'Japan', createdAt: '2026-10-31T10:00:00.000Z', coords: null }
    function Header() {
      const sync = useLibrarySync()
      return (
        <button type="button" onClick={() => sync.apply({ kind: 'upsert', items: [itemOfPlace(added as never)] })}>
          Add place
        </button>
      )
    }
    const user = userEvent.setup()
    render(
      <>
        <Header />
        <LibraryIndexed seed={seed} />
      </>
    )
    await screen.findByPlaceholderText('Search your atlas…')
    fetchMock.mockClear()
    server.version = 'v2'
    server.items = [...items, itemOfPlace(added as never)]

    await user.click(screen.getByRole('button', { name: 'Add place' }))
    await waitFor(() => expect(total(201)).toBeInTheDocument())
    await waitFor(() => expect(urls()).toContain('/api/library/index?v=v2'))
    expect(total(201)).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

})
