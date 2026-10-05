import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlaceWithRelations } from '@/types/database'
import type { ExploreCollection, ExplorePlace } from '@/lib/explore/types'
import { notify } from '@/lib/notify'
import { PlacePage } from '@/components/places/place-view/place-page'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }),
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
jest.mock('@/components/ui-custom/photo-lightbox', () => ({
  PhotoLightbox: () => null,
}))
jest.mock('@/components/places/place-full-view', () => ({
  PlaceFullView: () => <div>editor</div>,
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

const place = {
  ...base,
  id: 'plc_fushimi',
  name: 'Fushimi Inari-taisha',
  kind: 'landmark',
  city: 'Kyoto',
  admin: 'Kyoto Prefecture',
  country: 'Japan',
  coords: { lat: 34.9671, lon: 135.7727 },
  address: '68 Fukakusa Yabunouchichō, Fushimi Ward, Kyoto',
  altNames: [],
  description: 'Head shrine of Inari.',
  tags: [],
  vibes: [],
  ratingSelf: 0,
  notes: null,
  confidence: 0.94,
  price_level: null,
  best_time: null,
  activities: null,
  cuisine: null,
  amenities: null,
  website: null,
  phone: '+81 75-641-7331',
  email: null,
  hours: null,
  visitStatus: 'planned',
  priority: 5,
  lastVisited: null,
  plannedVisit: '2026-11-18',
  recommendedBy: null,
  companions: null,
  practicalInfo: null,
  attachments: [
    { id: 'att_1', placeId: 'plc_fushimi', type: 'photo', uri: 'https://example.com/1.jpg', thumbnailUri: null, isPrimary: 1, source: 'upload', attribution: null, caption: null, filename: '1.jpg' },
  ],
  links: [],
  reservations: [],
  sources: [],
  collections: [{ id: 'col_beach', name: 'Beach trip' }],
} as unknown as PlaceWithRelations

const trips: ExploreCollection[] = [
  { id: 'col_beach', name: 'Beach trip', placeIds: ['plc_fushimi'] },
  { id: 'col_kyoto', name: 'Kyoto in autumn', placeIds: [] },
]

const alsoIn: ExplorePlace[] = [
  {
    id: 'plc_arashiyama',
    name: 'Arashiyama Bamboo Grove',
    kind: 'park',
    city: 'Kyoto',
    country: 'Japan',
    description: null,
    notes: null,
    vibes: [],
    bestTimeText: null,
    bestTime: { months: [], yearRound: false, times: [] },
    recommendedBy: null,
    visitStatus: 'not_visited',
    priority: 0,
    ratingSelf: 0,
    priceLevel: null,
    createdAt: '2024-04-14T09:00:00.000Z',
    lat: null,
    lon: null,
    photos: [{ uri: 'https://example.com/bamboo.jpg', thumb: 'https://example.com/bamboo.jpg' }],
  },
]

const sparse = {
  ...base,
  id: 'plc_bar_leone',
  name: 'Bar Leone',
  kind: 'bar',
  status: 'inbox',
  city: 'Hong Kong',
  country: 'China',
  coords: null,
  phone: null,
  attachments: [],
  links: [],
  reservations: [],
  sources: [],
  collections: [],
} as unknown as PlaceWithRelations

describe('PlacePage additions — trips', () => {
  beforeEach(() => mockRefresh.mockClear())

  it('lists the trips the place is already in', () => {
    render(<PlacePage place={place} trips={trips} />)
    const plan = screen.getByLabelText('Plan and practical details')
    expect(within(plan).getByRole('link', { name: 'Beach trip' })).toHaveAttribute('href', '/collections/col_beach/planner')
  })

  it('adds the place to a trip through the collection API and refreshes', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<PlacePage place={place} trips={trips} />)
    const buttons = screen.getAllByRole('button', { name: 'Add to trip' })
    await userEvent.click(buttons[0])

    // The place is already in "Beach trip", so only "Kyoto in autumn" is offered.
    expect(await screen.findByText('Already in Beach trip')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Kyoto in autumn' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/collections/col_kyoto/places', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ placeIds: ['plc_fushimi'] }),
    })))
    expect(notify.success).toHaveBeenCalledWith('Added to Kyoto in autumn', expect.anything())
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('creates a new trip named after the city and adds the place', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ collection: { id: 'col_new' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<PlacePage place={place} trips={trips} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Add to trip' })[0])
    await userEvent.click(await screen.findByRole('menuitem', { name: /New trip with this place/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/collections', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Kyoto trip', description: 'Saved from a place' }),
    })))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/collections/col_new/places', expect.anything()))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('retries a half-built new trip instead of creating a second one', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ collection: { id: 'col_new' } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<PlacePage place={place} trips={trips} />)
    const newTrip = async () => {
      await userEvent.click(screen.getAllByRole('button', { name: 'Add to trip' })[0])
      await userEvent.click(await screen.findByRole('menuitem', { name: /New trip with this place/ }))
    }

    await newTrip()
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Kyoto trip was created, but this place didn\'t save to it.', expect.anything()))

    await newTrip()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/collections')).toHaveLength(1)
    expect(fetchMock.mock.calls[2][0]).toBe('/api/collections/col_new/places')
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Added to Kyoto trip', expect.anything()))
  })
})

describe('PlacePage additions — on the ground + bar', () => {
  it('shows the map, Directions and Call with correct targets', () => {
    render(<PlacePage place={place} trips={trips} />)
    expect(screen.getByLabelText('Map of Fushimi Inari-taisha')).toBeInTheDocument()

    const ground = screen.getByLabelText('On the ground')
    expect(within(ground).getByRole('link', { name: 'Directions' })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=34.9671,135.7727')
    expect(within(ground).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+81756417331')

    // The mobile bar repeats both and the Add-to-trip action.
    const directions = screen.getAllByRole('link', { name: 'Directions' })
    expect(directions.length).toBeGreaterThanOrEqual(2)
    expect(directions.every((el) => el.getAttribute('href') === 'https://www.google.com/maps/dir/?api=1&destination=34.9671,135.7727')).toBe(true)
    expect(screen.getByRole('link', { name: 'Call Fushimi Inari-taisha' })).toHaveAttribute('href', 'tel:+81756417331')
  })

  it('leaves Directions and Call out when the place has no coords or phone', () => {
    render(<PlacePage place={sparse} trips={[]} />)
    expect(screen.getByText('No address, hours or contact yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Directions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Call' })).not.toBeInTheDocument()
    // Add to trip survives even for a bare place.
    expect(screen.getAllByRole('button', { name: 'Add to trip' }).length).toBeGreaterThanOrEqual(1)
  })
})

describe('PlacePage additions — also in {city}', () => {
  it('renders the neighbour rail and hides it when empty', () => {
    const { rerender } = render(<PlacePage place={place} trips={trips} alsoIn={alsoIn} />)
    expect(screen.getByRole('heading', { name: '1 more save nearby' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Arashiyama Bamboo Grove/ })).toBeInTheDocument()

    rerender(<PlacePage place={place} trips={trips} alsoIn={[]} />)
    expect(screen.queryByRole('heading', { name: /more save/ })).not.toBeInTheDocument()
  })
})
