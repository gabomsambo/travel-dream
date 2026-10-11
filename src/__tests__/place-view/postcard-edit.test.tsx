import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlaceWithRelations } from '@/types/database'
import { PlacePage } from '@/components/places/place-view/place-page'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn(), replace: jest.fn() }),
}))
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
    const ReactActual = jest.requireActual('react')
    const Lazy = ReactActual.lazy(loader)
    return function DynamicMock(props: Record<string, unknown>) {
      return ReactActual.createElement(ReactActual.Suspense, { fallback: null }, ReactActual.createElement(Lazy, props))
    }
  },
}))
jest.mock('@/components/ui-custom/photo-lightbox', () => ({ PhotoLightbox: () => null }))
jest.mock('@/components/places/place-full-view', () => ({
  PlaceFullView: ({ initialPlace, onDone }: { initialPlace: { name: string }; onDone?: () => void }) => (
    <div>
      <p>Editing: {initialPlace.name}</p>
      <button onClick={onDone}>Done</button>
    </div>
  ),
}))
jest.mock('@/components/places/find-image-button', () => ({ FindImageButton: () => <button>Find Image</button> }))
jest.mock('@/components/upload/photo-uploader', () => ({ PhotoUploader: () => <button>Upload</button> }))

const place = {
  userId: 'user_1',
  googlePlaceId: null,
  status: 'library',
  createdAt: '2024-04-14T09:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
  id: 'plc_fushimi',
  name: 'Fushimi Inari-taisha',
  kind: 'landmark',
  city: 'Kyoto',
  admin: 'Kyoto Prefecture',
  country: 'Japan',
  coords: { lat: 34.9671, lon: 135.7727 },
  address: '68 Fukakusa',
  altNames: ['Inari Shrine'],
  description: 'Head shrine of Inari.',
  tags: ['hiking'],
  vibes: ['iconic'],
  ratingSelf: 4,
  notes: 'Hike all the way up.',
  confidence: 0.94,
  price_level: 'Free',
  best_time: 'Dawn',
  activities: ['hiking'],
  cuisine: [],
  amenities: [],
  website: 'https://inari.jp/en/',
  phone: '+81 75-641-7331',
  email: 'info@inari.jp',
  hours: { monday: '09:00-17:00' },
  visitStatus: 'planned',
  priority: 5,
  lastVisited: null,
  plannedVisit: '2026-11-18',
  recommendedBy: 'Kenji',
  companions: ['Ana'],
  practicalInfo: 'Wear shoes.',
  attachments: [],
  links: [],
  reservations: [],
  sources: [],
  collections: [],
} as PlaceWithRelations

const sparse = {
  ...place,
  id: 'plc_sparse',
  name: 'Kissa Sora',
  kind: 'cafe',
  notes: null,
  recommendedBy: null,
  description: null,
  altNames: [],
  tags: [],
  vibes: [],
  ratingSelf: 0,
  price_level: null,
  best_time: null,
  activities: [],
  address: null,
  admin: null,
  coords: null,
  hours: null,
  website: null,
  phone: null,
  email: null,
  priority: 0,
  plannedVisit: null,
  companions: [],
  practicalInfo: null,
} as PlaceWithRelations

function jsonResponse(ok: boolean, message?: string) {
  return { ok, json: async () => (ok ? { status: 'success' } : { message: message ?? "Couldn't save" }) }
}

function setMobile(mobile: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('Postcard edit mode', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    window.localStorage.clear()
    setMobile(false)
  })

  it('shows + Add rows only while editing, and keeps the sparse invitations in read mode', async () => {
    render(<PlacePage place={sparse} />)
    expect(screen.getByText('Only the basics so far')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add a phone number' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add a description' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.queryByText('Only the basics so far')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add your note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add a description' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add a phone number' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add a photo' })).toBeInTheDocument()
  })

  it('saves the hero name and category as partial patches', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(true))
    global.fetch = fetchMock as unknown as typeof fetch
    render(<PlacePage place={place} startInEdit />)

    const name = screen.getByRole('textbox', { name: 'Place name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Torii Gates')
    await waitFor(() => {
      const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>)
      expect(bodies).toContainEqual({ name: 'Torii Gates' })
    }, { timeout: 2000 })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'cafe')
    await waitFor(() => {
      const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>)
      expect(bodies).toContainEqual({ kind: 'cafe' })
    }, { timeout: 2000 })
  })

  it('keeps two quick section edits when a stale refresh arrives mid-save', async () => {
    const resolvers: Array<(value: ReturnType<typeof jsonResponse>) => void> = []
    const fetchMock = jest.fn().mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    global.fetch = fetchMock as unknown as typeof fetch
    const { rerender } = render(<PlacePage place={place} startInEdit />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit About' }))
    const description = screen.getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'Gates.')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ description: 'Gates.' })

    await userEvent.click(screen.getByRole('button', { name: "Edit Why it's here" }))
    const note = screen.getByLabelText('Your note')
    await userEvent.clear(note)
    await userEvent.type(note, 'Walk up.')

    rerender(<PlacePage place={place} startInEdit />)
    expect(screen.getByLabelText('Your note')).toHaveValue('Walk up.')

    await act(async () => {
      resolvers[0](jsonResponse(true))
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ notes: 'Walk up.' })

    await userEvent.click(screen.getByRole('button', { name: 'Edit About' }))
    expect(screen.getByLabelText('Description')).toHaveValue('Gates.')
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()
  })

  it('stays in edit mode when Done cannot save the last change', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(false, 'Server exploded'))
    global.fetch = fetchMock as unknown as typeof fetch
    render(<PlacePage place={place} startInEdit />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit About' }))
    const description = screen.getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'Nope.')
    await waitFor(() => expect(screen.getAllByText('Server exploded').length).toBeGreaterThan(0), { timeout: 2000 })

    const calls = fetchMock.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls))
    expect(screen.getByText('Changes save as you type')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue('Nope.')
    expect(screen.getByRole('textbox', { name: 'Place name' })).toBeInTheDocument()
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()
  })

  it('on a phone, a section row opens the sheet and closing it returns to the index', async () => {
    setMobile(true)
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(true))
    global.fetch = fetchMock as unknown as typeof fetch
    render(<PlacePage place={sparse} startInEdit />)

    const add = await screen.findByRole('button', { name: /\+ Add a description/ })
    add.focus()
    await userEvent.click(add)

    const dialog = await screen.findByRole('dialog', { name: 'Edit About' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Done with About' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(add).toHaveFocus()
    expect(screen.getByText('Changes save as you type')).toBeInTheDocument()
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()
  })

  it('drops a queued hero name when the field is cleared and stays in edit mode', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(true))
    global.fetch = fetchMock as unknown as typeof fetch
    const { rerender } = render(<PlacePage place={place} startInEdit />)

    const name = screen.getByRole('textbox', { name: 'Place name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'B')
    await userEvent.clear(name)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    })

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>)
    expect(bodies.filter((body) => 'name' in body)).toEqual([])
    expect(name).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('textbox', { name: 'Place name' })).toHaveValue('')
    expect(screen.getAllByText('Place name is required').length).toBeGreaterThan(0)
    expect(screen.getByText('Changes save as you type')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: place.name })).not.toBeInTheDocument()

    rerender(<PlacePage place={{ ...place }} startInEdit />)
    expect(screen.getByRole('textbox', { name: 'Place name' })).toHaveValue(place.name)
  })

  it('mentions planned or visited status on the phone plan row before an empty label', async () => {
    setMobile(true)
    const bare = {
      ...sparse,
      visitStatus: 'planned' as const,
      priority: 0,
      ratingSelf: 0,
      plannedVisit: null,
      lastVisited: null,
      companions: [],
      reservations: [],
    }
    const { rerender } = render(<PlacePage place={bare} startInEdit />)

    expect(await screen.findByRole('button', { name: 'Your plan Planned' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Your plan Nothing here yet' })).not.toBeInTheDocument()

    rerender(<PlacePage place={{ ...bare, visitStatus: 'visited' }} startInEdit />)
    expect(screen.getByRole('button', { name: 'Your plan Been' })).toBeInTheDocument()

    rerender(<PlacePage place={{ ...bare, visitStatus: 'not_visited' }} startInEdit />)
    expect(screen.getByRole('button', { name: 'Your plan Nothing here yet' })).toBeInTheDocument()
  })

  it('returns focus to the section row when the add row that opened the sheet is gone', async () => {
    setMobile(true)
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(true))
    global.fetch = fetchMock as unknown as typeof fetch
    render(<PlacePage place={sparse} startInEdit />)

    const add = await screen.findByRole('button', { name: /\+ Add a description/ })
    add.focus()
    await userEvent.click(add)

    const dialog = await screen.findByRole('dialog', { name: 'Edit About' })
    await userEvent.type(within(dialog).getByLabelText('Description'), 'A')
    expect(screen.queryByRole('button', { name: /\+ Add a description/ })).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Done with About' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toHaveTextContent('About')
    expect(document.activeElement).toHaveTextContent('A')
    expect(document.activeElement).not.toHaveTextContent('+ Add')
    expect(document.activeElement).toHaveAttribute('data-edit-section', 'about')
  })
})
