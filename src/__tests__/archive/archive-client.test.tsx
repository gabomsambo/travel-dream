import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveClient } from '@/components/archive/archive-client'
import { ArchiveToolbar, ARCHIVE_SHORTCUTS } from '@/components/archive/archive-toolbar'
import { ActiveFilterChips } from '@/components/library/active-filter-chips'
import type { ArchivePlace } from '@/lib/archive/view'

const mockPush = jest.fn()
const mockRefresh = jest.fn()
const mockSearchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: mockRefresh,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/archive',
}))

function place(over: Partial<ArchivePlace> & Pick<ArchivePlace, 'id' | 'name'>): ArchivePlace {
  return {
    kind: 'cafe',
    city: 'Lisbon',
    country: 'Portugal',
    description: null,
    notes: 'A note the person wrote',
    tags: ['quiet'],
    vibes: ['sunset'],
    ratingSelf: 4,
    visitStatus: 'visited',
    priceLevel: null,
    coverUrl: 'https://example.com/cover.jpg',
    createdAt: '2024-11-02T00:00:00.000Z',
    archivedAt: '2026-03-12T00:00:00.000Z',
    trips: [],
    status: 'archived',
    ...over,
  }
}

const rich = place({
  id: 'plc_rich',
  name: 'Miradouro da Senhora do Monte',
  kind: 'viewpoint',
  trips: [{ id: 'col_lisbon', name: 'Lisbon in 5 days' }],
})
const sparse = place({
  id: 'plc_sparse',
  name: 'Screenshot 2024-11-02',
  kind: 'cafe',
  city: null,
  country: null,
  coverUrl: null,
  archivedAt: null,
  notes: null,
  tags: [],
  vibes: [],
  ratingSelf: 0,
})
const museum = place({
  id: 'plc_museum',
  name: 'TeamLab Borderless',
  kind: 'museum',
  city: 'Tokyo',
  country: 'Japan',
  coverUrl: null,
  notes: null,
})
const places = [rich, sparse, museum]

beforeEach(() => {
  localStorage.clear()
  mockPush.mockReset()
  mockRefresh.mockReset()
  for (const key of [...mockSearchParams.keys()]) mockSearchParams.delete(key)
  ;(global.fetch as jest.Mock).mockReset()
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ result: { updatedCount: 1 } }),
    blob: async () => new Blob(['x']),
  })
})

describe('ArchiveClient', () => {
  it('opens on the list, with a set-aside date, a saved date, and no bare comma', () => {
    render(<ArchiveClient places={places} />)
    expect(screen.getByRole('heading', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByText('Set aside 12 Mar 2026').length).toBeGreaterThan(0)
    expect(screen.getByText('Saved 2 Nov 2024')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Still on Lisbon in 5 days' })).toHaveAttribute('href', '/collections/col_lisbon')
    expect(screen.queryByText(/object Set/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^,$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/, Mexico/)).not.toBeInTheDocument()
    const sparseRow = screen.getByRole('link', { name: 'Screenshot 2024-11-02' })
    expect(sparseRow).toHaveAttribute('href', '/place/plc_sparse')
  })

  it('opens the place from a row, and switches to gallery and journal', async () => {
    const user = userEvent.setup()
    render(<ArchiveClient places={places} />)
    expect(screen.getByRole('link', { name: 'Miradouro da Senhora do Monte' })).toHaveAttribute('href', '/place/plc_rich')

    await user.click(screen.getByRole('radio', { name: 'Gallery' }))
    expect(screen.getByRole('heading', { name: 'Miradouro da Senhora do Monte' })).toBeInTheDocument()
    await user.click(screen.getByRole('heading', { name: 'TeamLab Borderless' }))
    expect(mockPush).toHaveBeenCalledWith('/place/plc_museum')

    await user.click(screen.getByRole('radio', { name: 'Journal' }))
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
    expect(screen.getByText(/A note the person wrote/, { selector: 'blockquote' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Still on Lisbon in 5 days' })).toBeInTheDocument()
  })

  it('keeps both kinds when the URL lists them, and Has Photos hides empty cards', async () => {
    mockSearchParams.set('kind', 'cafe,museum')
    const user = userEvent.setup()
    const { unmount } = render(<ArchiveClient places={places} />)
    expect(screen.getByRole('link', { name: 'TeamLab Borderless' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Screenshot 2024-11-02' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Miradouro da Senhora do Monte' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Kinds: cafe, museum/).length).toBeGreaterThan(0)
    unmount()

    for (const key of [...mockSearchParams.keys()]) mockSearchParams.delete(key)
    render(<ArchiveClient places={places} />)
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(await screen.findByLabelText('Has Photos'))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('link', { name: 'TeamLab Borderless' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Miradouro da Senhora do Monte' })).toBeInTheDocument()
  })

  it('restores and deletes one row, and the selection', async () => {
    const user = userEvent.setup()
    render(<ArchiveClient places={places} />)

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    const restore = await screen.findByRole('alertdialog')
    expect(within(restore).getByText(/back to your library/)).toBeInTheDocument()
    await user.click(within(restore).getByRole('button', { name: 'Restore to Library' }))
    expect(global.fetch).toHaveBeenCalledWith('/api/places/bulk-actions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'restore', placeIds: ['plc_rich'] }),
    }))

    await user.click(screen.getByRole('checkbox', { name: 'Select TeamLab Borderless' }))
    expect(screen.getByRole('button', { name: 'All remaining' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Select Screenshot 2024-11-02' }))
    await user.click(screen.getByRole('button', { name: /Restore to Library \(2\)/ }))
    const bulk = await screen.findByRole('alertdialog')
    await user.click(within(bulk).getByRole('button', { name: 'Restore to Library' }))
    expect(global.fetch).toHaveBeenCalledWith('/api/places/bulk-actions', expect.objectContaining({
      body: JSON.stringify({ action: 'restore', placeIds: ['plc_museum', 'plc_sparse'] }),
    }))
  })

  it('requires the typed confirm, says what delete actually removes, and drops the row immediately', async () => {
    const user = userEvent.setup()
    let resolveFetch: (value: unknown) => void = () => {}
    ;(global.fetch as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))
    render(<ArchiveClient places={places} />)

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).queryByText(/completely removed from the database/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/stay in storage/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete Permanently' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Type "confirm"/), 'confirm')
    await user.click(within(dialog).getByRole('button', { name: 'Delete Permanently' }))
    expect(screen.queryByRole('link', { name: 'Miradouro da Senhora do Monte' })).not.toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/places/bulk-actions', expect.objectContaining({
      body: JSON.stringify({ action: 'delete', placeIds: ['plc_rich'] }),
    }))
    resolveFetch({ ok: true, json: async () => ({ result: { updatedCount: 1 } }) })
  })

  it('gives a gallery card a menu of Restore and Delete', async () => {
    const user = userEvent.setup()
    render(<ArchiveClient places={places} />)
    await user.click(screen.getByRole('radio', { name: 'Gallery' }))
    await user.click(screen.getByRole('button', { name: 'More for Miradouro da Senhora do Monte' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Restore' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })
})

describe('archive defects that are not the page', () => {
  it('does not print an empty kinds set as [object Set]', () => {
    const { rerender } = render(<ActiveFilterChips filters={{ kinds: new Set() }} onRemoveFilter={() => {}} />)
    expect(screen.queryByText(/object Set/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Kinds/)).not.toBeInTheDocument()
    rerender(<ActiveFilterChips filters={{ kinds: new Set(['cafe', 'museum']) }} onRemoveFilter={() => {}} />)
    expect(screen.getByText('Kinds: cafe, museum')).toBeInTheDocument()
  })

  it('lists only the shortcuts the page implements', () => {
    render(
      <ArchiveToolbar
        selectedCount={1}
        totalCount={3}
        isSomeSelected
        onRestoreSelected={() => {}}
        onDeleteSelected={() => {}}
        onSelectAll={() => {}}
        onSelectNone={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'All remaining' })).toBeInTheDocument()
    expect(ARCHIVE_SHORTCUTS.join(' ')).not.toMatch(/j\/k|Navigate|Cmd\+Shift\+A/)
    expect(ARCHIVE_SHORTCUTS).toEqual([
      'r — Restore the selection',
      'd — Delete the selection',
      'Cmd/Ctrl+A — Select all shown',
      'Esc — Clear the selection',
    ])
  })
})
