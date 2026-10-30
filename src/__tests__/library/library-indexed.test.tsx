import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryIndexed } from '@/components/library/library-indexed'
import { resetHeartWriterForTests } from '@/lib/explore/dreams'
import { buildFirstScreen } from '@/lib/library/first-screen'
import { clearLibraryIndex } from '@/lib/library/index-store'
import { encodeIndex } from '@/lib/library/wire'
import { item, photo } from '../helpers/library-items'
import { renderInMain as render, stubTallMain } from '../helpers/tall-main'

stubTallMain()

const NOW = new Date('2026-10-30T12:00:00Z')
const fetchMock = global.fetch as jest.Mock

// 200 places over 3 countries; the first screen holds the biggest country's first seven.
const items = Array.from({ length: 200 }, (_, i) =>
  item({
    id: `plc_${i}`,
    name: `Place ${i}`,
    country: i % 10 === 0 ? 'Italy' : i % 10 === 1 ? 'Mexico' : 'Japan',
    city: `City ${i % 4}`,
    photos: [photo, { ...photo, uri: 'https://store.public.blob.vercel-storage.com/p2.jpg' }],
    photoCount: 2,
    createdAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
  })
)
const collections = [{ id: 'col_1', name: 'Trip', description: null, placeIds: ['plc_2'] }]

const seed = buildFirstScreen({
  userId: 'usr_test',
  version: 'v1',
  items,
  collections,
  inboxCount: 2,
  heartIds: [],
  savedViews: [],
  params: new URLSearchParams(),
  now: NOW,
})
const onFirstScreen = seed.chapters[0].items[0]
const offFirstScreen = items.find((p) => !seed.chapters.some((c) => c.items.some((x) => x.id === p.id)) && p.country === 'Japan')!

const tile = (id: string) => document.querySelector<HTMLElement>(`[data-place-id="${id}"]`)
const indexBody = () => JSON.parse(JSON.stringify(encodeIndex({ version: 'v1', items, collections })))

function holdIndex() {
  let release!: (status?: number) => void
  const gate = new Promise((resolve) => {
    release = (status = 200) => resolve({ ok: status < 400, status, json: () => Promise.resolve(indexBody()) })
  })
  fetchMock.mockImplementation((url: string) => (url.startsWith('/api/library/index') ? gate : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })))
  return release
}

beforeEach(() => {
  localStorage.clear()
  resetHeartWriterForTests()
  clearLibraryIndex()
  fetchMock.mockReset()
  window.history.replaceState(null, '', '/')
})

describe('LibraryIndexed', () => {
  it('paints the first screen from the seed before the index arrives', () => {
    holdIndex()
    render(<LibraryIndexed seed={seed} />)

    expect(screen.getByRole('heading', { name: 'Your atlas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: seed.chapters[0].title })).toBeInTheDocument()
    expect(tile(onFirstScreen.id)).toBeInTheDocument()
    expect(tile(offFirstScreen.id)).not.toBeInTheDocument()
    expect(screen.getByText(/Dreaming/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the rest of your 200 places')
    expect(screen.queryByPlaceholderText('Search your atlas…')).not.toBeInTheDocument()
  })

  it('asks for the index it was told about, once', async () => {
    const release = holdIndex()
    render(<LibraryIndexed seed={seed} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/library/index?v=v1'))
    await act(async () => release())
    await screen.findByPlaceholderText('Search your atlas…')
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/library/index'))).toHaveLength(1)
  })

  it('takes over with the whole library when the index lands', async () => {
    const release = holdIndex()
    render(<LibraryIndexed seed={seed} />)
    await act(async () => release())

    expect(await screen.findByPlaceholderText('Search your atlas…')).toBeInTheDocument()
    expect(screen.queryByText(/Loading the rest of your/)).not.toBeInTheDocument()
    // The page's own summary now counts all of them.
    expect(screen.getByText('200 places', { selector: 'p.sr-only' })).toBeInTheDocument()
  })

  it('opens quick look on a first-screen place at once, and keeps it open through the swap', async () => {
    const release = holdIndex()
    const user = userEvent.setup()
    render(<LibraryIndexed seed={seed} />)

    await user.click(tile(onFirstScreen.id)!)
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: onFirstScreen.name })).toBeInTheDocument()

    await act(async () => release())
    await waitFor(() => expect(screen.getByPlaceholderText('Search your atlas…')).toBeInTheDocument())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: onFirstScreen.name })).toBeInTheDocument()
  })

  it('asks for a place’s other photos when quick look opens it', async () => {
    const release = holdIndex()
    const user = userEvent.setup()
    render(<LibraryIndexed seed={seed} />)
    await act(async () => release())
    await screen.findByPlaceholderText('Search your atlas…')

    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(url.startsWith('/api/library/photos/') ? { photos: [photo, photo, photo] } : {}),
      })
    )
    await user.click(tile(onFirstScreen.id)!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/library/photos/${onFirstScreen.id}`, expect.anything()))
    expect(await screen.findAllByRole('button', { name: /^Photo \d$/ })).toHaveLength(3)
  })

  it('says so when the rest cannot be loaded, and loads it on Try again', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }))
    render(<LibraryIndexed seed={seed} />)

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Couldn.t load the rest of your library/)
    expect(screen.getByRole('heading', { name: 'Your atlas' })).toBeInTheDocument()

    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(indexBody()) }))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByPlaceholderText('Search your atlas…')).toBeInTheDocument()
  })

  it('shows the whole page straight away on a return visit', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(indexBody()) }))
    const first = render(<LibraryIndexed seed={seed} />)
    await screen.findByPlaceholderText('Search your atlas…')
    first.unmount()
    fetchMock.mockClear()

    render(<LibraryIndexed seed={seed} />)
    expect(screen.getByPlaceholderText('Search your atlas…')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/library/index'))
  })
})
