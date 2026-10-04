import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlaceWithRelations } from '@/types/database'
import { notify } from '@/lib/notify'
import { PlacePage } from '@/components/places/place-view/place-page'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }),
}))
// next/dynamic as a plain React.lazy, so the lazily loaded editor and lightbox resolve
// to the module mocks below.
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
jest.mock('@/components/ui-custom/photo-lightbox', () => ({
  PhotoLightbox: ({ open, index }: { open: boolean; index: number }) =>
    open ? <div data-testid="lightbox">photo {index + 1}</div> : null,
}))
// The editor itself is covered by its own tests; here it only has to be reachable and exit.
jest.mock('@/components/places/place-full-view', () => ({
  PlaceFullView: ({ initialPlace, onDone }: { initialPlace: { name: string; visitStatus?: string }; onDone?: () => void }) => (
    <div>
      <p>Editing: {initialPlace.name}</p>
      <p data-testid="editor-status">{initialPlace.visitStatus ?? 'none'}</p>
      <button onClick={onDone}>Done</button>
    </div>
  ),
}))
jest.mock('@/components/places/find-image-button', () => ({
  FindImageButton: () => <button>Find Image</button>,
}))

const base = {
  userId: 'user_1',
  googlePlaceId: null,
  status: 'library',
  createdAt: '2024-04-14T09:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
}

const rich = {
  ...base,
  id: 'plc_fushimi',
  name: 'Fushimi Inari-taisha',
  kind: 'landmark',
  city: 'Kyoto',
  admin: 'Kyoto Prefecture',
  country: 'Japan',
  coords: { lat: 34.9671, lon: 135.7727 },
  address: '68 Fukakusa Yabunouchichō, Fushimi Ward, Kyoto',
  altNames: ['Inari Shrine'],
  description: 'Head shrine of Inari, at the foot of Mount Inari.',
  tags: ['landmark', 'hiking'],
  vibes: ['iconic', 'photogenic'],
  ratingSelf: 4,
  notes: 'Hike all the way up past the tourists.',
  confidence: 0.94,
  price_level: 'Free',
  best_time: 'Dawn, November',
  activities: ['hiking'],
  cuisine: ['kitsune udon'],
  amenities: ['tea houses'],
  website: 'https://inari.jp/en/',
  phone: '+81 75-641-7331',
  email: 'info@inari.jp',
  hours: { monday: '00:00-23:59', tuesday: '00:00-23:59', wednesday: '00:00-23:59', thursday: '00:00-23:59', friday: '00:00-23:59', saturday: '00:00-23:59', sunday: '00:00-23:59' },
  visitStatus: 'planned',
  priority: 5,
  lastVisited: '2025-05-01',
  plannedVisit: '2026-11-18',
  recommendedBy: 'Kenji',
  companions: ['Ana', 'Diego'],
  practicalInfo: 'Wear proper shoes.',
  attachments: [
    { id: 'att_2', placeId: 'plc_fushimi', type: 'photo', uri: 'https://example.com/2.jpg', thumbnailUri: null, isPrimary: 0, source: 'upload', attribution: null, caption: null, filename: '2.jpg' },
    { id: 'att_1', placeId: 'plc_fushimi', type: 'photo', uri: 'https://example.com/1.jpg', thumbnailUri: null, isPrimary: 1, source: 'wikimedia', attribution: { kind: 'wikimedia', authorText: 'Commons contributors', licenseShortName: 'CC BY-SA', licenseUrl: '', descriptionUrl: '' }, caption: null, filename: '1.jpg' },
  ],
  links: [
    { id: 'lnk_1', placeId: 'plc_fushimi', url: 'https://www.japan-guide.com/e/e3915.html', title: 'japan-guide: Fushimi Inari Shrine', description: null, type: 'article', platform: null, createdAt: '2024-05-01' },
    { id: 'lnk_2', placeId: 'plc_fushimi', url: 'javascript:alert(1)', title: 'Sneaky link', description: null, type: 'website', platform: null, createdAt: '2024-05-01' },
  ],
  reservations: [
    {
      id: 'res_1', placeId: 'plc_fushimi', reservationDate: '2026-11-18', reservationTime: '05:30', confirmationNumber: 'GYG-7HQ2K9',
      status: 'confirmed', partySize: 3, bookingPlatform: 'GetYourGuide', bookingUrl: 'https://www.getyourguide.com/booking/1',
      specialRequests: 'Vegetarian breakfast', totalCost: '¥18,000', notes: 'Meet at the Romon gate.', createdAt: '2026-09-30', updatedAt: '2026-09-30',
    },
  ],
  sources: [
    { id: 'src_1', userId: 'user_1', type: 'screenshot', uri: 'https://blob.example/IMG_4412.PNG', ocrText: 'no one there!', meta: { platform: 'instagram', author: '@wanderwithmaya', filename: 'IMG_4412.PNG' }, createdAt: '2024-04-14T09:00:00.000Z' },
  ],
} as unknown as PlaceWithRelations

const sparse = {
  ...base,
  id: 'plc_bar_leone',
  name: 'Bar Leone',
  kind: 'bar',
  status: 'inbox',
  city: 'Hong Kong',
  country: 'China',
  admin: null, coords: null, address: null, altNames: [], description: null, tags: [], vibes: [], ratingSelf: 0, notes: null,
  confidence: 0.62, price_level: null, best_time: null, activities: null, cuisine: null, amenities: null, website: null, phone: null,
  email: null, hours: null, visitStatus: 'not_visited', priority: 0, lastVisited: null, plannedVisit: null, recommendedBy: null,
  companions: null, practicalInfo: null,
  attachments: [], links: [], reservations: [],
  sources: [{ id: 'src_2', userId: 'user_1', type: 'screenshot', uri: 'https://blob.example/IMG_9921.PNG', ocrText: null, meta: { platform: 'tiktok', filename: 'IMG_9921.PNG' }, createdAt: '2026-09-28T21:13:00.000Z' }],
} as unknown as PlaceWithRelations

describe('PlacePage view mode', () => {
  beforeEach(() => mockRefresh.mockClear())

  it('opens in view mode, not in the editor', () => {
    render(<PlacePage place={rich} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Fushimi Inari-taisha' })).toBeInTheDocument()
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    // Edit and the ⋯ menu (archive, delete) are the way into everything else.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('shows every stored field of the rich place somewhere on the page', () => {
    const { container } = render(<PlacePage place={rich} />)
    const text = container.textContent ?? ''
    for (const value of [
      'Landmark', 'Kyoto', 'Kyoto Prefecture', 'Japan', 'iconic • photogenic', // hero
      'Hike all the way up past the tourists.', 'Kenji', 'Saved Apr 14, 2024', // why it's here
      'Head shrine of Inari', 'Also known as Inari Shrine', // about
      'Dawn, November', 'Free', 'hiking', 'kitsune udon', 'tea houses', '#landmark #hiking', 'Wear proper shoes.', // good to know
      'Planned for Wed, Nov 18, 2026', 'Last visited Thu, May 1, 2025', 'With Ana & Diego', 'Bucket list', // plan
      'Open 24 hours, every day', '68 Fukakusa Yabunouchichō', '34.9671, 135.7727', 'inari.jp/en', '+81 75-641-7331', 'info@inari.jp', // on the ground
      'Instagram screenshot', '@wanderwithmaya', 'IMG_4412.PNG', 'no one there!', // sources
      'plc_fushimi', 'High (94%)', // record info
    ]) {
      expect(text).toContain(value)
    }
    expect(screen.getByRole('img', { name: 'Your rating: 4 of 5' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Priority: 5 of 5' })).toBeInTheDocument()
  })

  it('surfaces the reservation fields the old card never showed', () => {
    render(<PlacePage place={rich} />)
    const ticket = screen.getByTestId('reservation-ticket')
    for (const value of ['Wed, Nov 18, 2026 · 5:30 AM', 'GetYourGuide · 3 people · ¥18,000', 'confirmed', 'GYG-7HQ2K9', 'Vegetarian breakfast', 'Meet at the Romon gate.']) {
      expect(ticket).toHaveTextContent(value)
    }
    expect(within(ticket).getByRole('link', { name: /Open booking/ })).toHaveAttribute('href', 'https://www.getyourguide.com/booking/1')
    expect(within(ticket).getByRole('button', { name: 'Copy confirmation number' })).toBeInTheDocument()
  })

  it('shows link titles and never turns a non-http URL into a link', () => {
    render(<PlacePage place={rich} />)
    expect(screen.getByRole('link', { name: /japan-guide: Fushimi Inari Shrine/ })).toHaveAttribute('href', 'https://www.japan-guide.com/e/e3915.html')
    expect(screen.getByText('Sneaky link')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sneaky link/ })).not.toBeInTheDocument()
  })

  it('puts the cover photo first and opens the lightbox from the photos', async () => {
    const { container } = render(<PlacePage place={rich} />)
    expect(container.querySelector('section img')).toHaveAttribute('src', 'https://example.com/1.jpg')
    await userEvent.click(screen.getByRole('button', { name: '2 photos' }))
    expect(await screen.findByTestId('lightbox')).toHaveTextContent('photo 1')
    expect(screen.getAllByText(/Commons contributors/).length).toBeGreaterThan(0)
  })

  it('links the location to the Atlas pages', () => {
    render(<PlacePage place={rich} />)
    expect(screen.getByRole('link', { name: 'Kyoto' })).toHaveAttribute('href', '/explore/atlas/japan/kyoto')
    expect(screen.getByRole('link', { name: 'Japan' })).toHaveAttribute('href', '/explore/atlas/japan')
  })
})

describe('PlacePage sparse place', () => {
  it('hides empty sections and offers invitations instead of blank inputs', () => {
    render(<PlacePage place={sparse} />)
    expect(screen.getByText('Only the basics so far')).toBeInTheDocument()
    for (const name of [/Why did you save it\?/, /Add a photo/, /Address & hours/, /Describe it/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByText('The place')).not.toBeInTheDocument()
    expect(screen.queryByText('Before you go')).not.toBeInTheDocument()
    expect(screen.queryByText('Saved for later')).not.toBeInTheDocument()
    expect(screen.getByText('In your inbox')).toBeInTheDocument()
    expect(screen.getByText('TikTok screenshot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find Image' })).toBeInTheDocument()
    expect(screen.getByText('Low (62%)')).toBeInTheDocument()
  })

  it('an invitation opens the editor', async () => {
    render(<PlacePage place={sparse} />)
    await userEvent.click(screen.getByRole('button', { name: /Describe it/ }))
    expect(await screen.findByText('Editing: Bar Leone')).toBeInTheDocument()
  })
})

describe('PlacePage edit toggle', () => {
  it('Edit shows the existing editor and Done returns to the view with fresh data', async () => {
    render(<PlacePage place={rich} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Editing: Fushimi Inari-taisha')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Fushimi Inari-taisha' })).toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalled()
  })
})

describe('PlacePage one-tap visit status', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    mockRefresh.mockClear()
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('sends exactly one PATCH and updates the rail and hero chips immediately', async () => {
    const resolvers: Array<(value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void> = []
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    render(<PlacePage place={rich} />)

    expect(screen.getByRole('radio', { name: 'Planned' })).toBeChecked()
    expect(screen.getByText('Planned · Nov 18')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))

    expect(screen.getByRole('radio', { name: 'Been' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Planned' })).not.toBeChecked()
    expect(screen.getByText('Been there')).toBeInTheDocument()
    expect(screen.queryByText('Planned · Nov 18')).not.toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_fushimi', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ visitStatus: 'visited' }),
    }))

    await act(async () => {
      resolvers[0]({ ok: true, json: async () => ({ status: 'success' }) })
    })
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('keeps the confirmed status on screen between the PATCH success and the refresh landing', async () => {
    const resolvers: Array<(value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void> = []
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { rerender } = render(<PlacePage place={rich} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))
    await act(async () => {
      resolvers[0]({ ok: true, json: async () => ({ status: 'success' }) })
    })

    // The write confirmed but the refreshed prop has not landed yet: the stale 'planned'
    // prop must not flip the control back to Planned.
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Been' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Planned' })).not.toBeChecked()
    expect(screen.getByText('Been there')).toBeInTheDocument()
    expect(screen.queryByText('Planned · Nov 18')).not.toBeInTheDocument()

    // When the refreshed prop confirms the write, the override is released but stays 'Been'.
    rerender(<PlacePage place={{ ...rich, visitStatus: 'visited' }} />)
    expect(screen.getByRole('radio', { name: 'Been' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Planned' })).not.toBeChecked()
  })

  it('rolls back and reports the error when the PATCH fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'Server exploded' }) })
    render(<PlacePage place={rich} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Server exploded'))
    expect(screen.getByRole('radio', { name: 'Planned' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Been' })).not.toBeChecked()
    expect(screen.getByText('Planned · Nov 18')).toBeInTheDocument()
    expect(screen.queryByText('Been there')).not.toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('makes the latest selection win when two quick taps resolve out of order', async () => {
    const resolvers: Array<(value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void> = []
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { rerender } = render(<PlacePage place={rich} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Want to go' }))

    // The latest tap shows optimistically while the first write is still on the wire.
    expect(screen.getByRole('radio', { name: 'Want to go' })).toBeChecked()

    // Writes are serialized: only the first tap is in flight and carries its own value.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/places/plc_fushimi', expect.objectContaining({
      body: JSON.stringify({ visitStatus: 'visited' }),
    }))

    await act(async () => {
      resolvers[0]({ ok: true, json: async () => ({ status: 'success' }) })
    })

    // The first response must not clear the newer selection; it is now sent.
    expect(screen.getByRole('radio', { name: 'Want to go' })).toBeChecked()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/places/plc_fushimi', expect.objectContaining({
      body: JSON.stringify({ visitStatus: 'not_visited' }),
    }))

    await act(async () => {
      resolvers[1]({ ok: true, json: async () => ({ status: 'success' }) })
    })

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())

    // The server now reports the latest selection; the view shows that, not the first tap.
    rerender(<PlacePage place={{ ...rich, visitStatus: 'not_visited' }} />)
    expect(screen.getByRole('radio', { name: 'Want to go' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Been' })).not.toBeChecked()
    expect(screen.queryByText('Planned · Nov 18')).not.toBeInTheDocument()
    expect(screen.queryByText('Been there')).not.toBeInTheDocument()
  })

  it('does not roll back a newer selection when an earlier write fails', async () => {
    const resolvers: Array<(value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void> = []
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { rerender } = render(<PlacePage place={rich} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Want to go' }))

    await act(async () => {
      resolvers[0]({ ok: false, json: async () => ({ message: 'Server exploded' }) })
    })

    // The failing first write neither rolls back nor reports while a newer tap is queued.
    expect(screen.getByRole('radio', { name: 'Want to go' })).toBeChecked()
    expect(notify.error).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/places/plc_fushimi', expect.objectContaining({
      body: JSON.stringify({ visitStatus: 'not_visited' }),
    }))

    await act(async () => {
      resolvers[1]({ ok: true, json: async () => ({ status: 'success' }) })
    })

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    rerender(<PlacePage place={{ ...rich, visitStatus: 'not_visited' }} />)
    expect(screen.getByRole('radio', { name: 'Want to go' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Been' })).not.toBeChecked()
  })

  it('a later refresh does not resurrect an earlier selection after the write confirmed', async () => {
    const resolvers: Array<(value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void> = []
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { rerender } = render(<PlacePage place={rich} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))
    await act(async () => {
      resolvers[0]({ ok: true, json: async () => ({ status: 'success' }) })
    })
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())

    // The refresh that confirms the write reports 'visited'.
    rerender(<PlacePage place={{ ...rich, visitStatus: 'visited' }} />)
    expect(screen.getByRole('radio', { name: 'Been' })).toBeChecked()

    // A later refresh reports 'planned' again (the editor changed it server-side); the
    // view must follow the server instead of re-applying the stale selection.
    rerender(<PlacePage place={{ ...rich, visitStatus: 'planned' }} />)
    expect(screen.getByRole('radio', { name: 'Planned' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Been' })).not.toBeChecked()
    expect(screen.getByText('Planned · Nov 18')).toBeInTheDocument()
    expect(screen.queryByText('Been there')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight status write before the editor mounts and seeds it with the confirmed status', async () => {
    const resolvers: Array<(value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void> = []
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    render(<PlacePage place={rich} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Been' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    // The editor must not mount while the status PATCH is still on the wire, or its
    // full-record save could revert the tapped status.
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()

    await act(async () => {
      resolvers[0]({ ok: true, json: async () => ({ status: 'success' }) })
    })

    // Only after the write settled does the editor mount, seeded with the confirmed status.
    expect(await screen.findByText('Editing: Fushimi Inari-taisha')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('visited')
  })

  it('opens the editor directly with the current status when no write is pending', async () => {
    render(<PlacePage place={rich} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Editing: Fushimi Inari-taisha')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('planned')
  })
})
