import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HoursEditor } from '@/components/ui-custom/hours-editor'
import { ReservationsSection } from '@/components/places/place-full-view-sections/reservations-section'
import { PlacePage } from '@/components/places/place-view/place-page'
import { placeEditHref } from '@/lib/place-view/edit-link'
import type { PlaceWithRelations } from '@/types/database'

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
  PlaceFullView: ({ initialPlace, onDone }: { initialPlace: { name: string; description: string | null; reservations: unknown[] }; onDone?: () => void }) => (
    <div>
      <p>Editing: {initialPlace.name}</p>
      <p>Seeded description: {initialPlace.description}</p>
      <p>Reservations in editor: {initialPlace.reservations.length}</p>
      <button onClick={onDone}>Done</button>
    </div>
  ),
}))
jest.mock('@/components/places/find-image-button', () => ({
  FindImageButton: () => <button>Find Image</button>,
}))
jest.mock('@/components/upload/photo-uploader', () => ({
  PhotoUploader: () => <button>Upload</button>,
}))

const week = (value: string) => ({
  monday: value, tuesday: value, wednesday: value, thursday: value, friday: value, saturday: value, sunday: value,
})

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
  hours: week('09:00-17:00'),
  visitStatus: 'planned',
  priority: 5,
  lastVisited: null,
  plannedVisit: '2026-11-18',
  recommendedBy: 'Kenji',
  companions: ['Ana'],
  practicalInfo: 'Wear shoes.',
  attachments: [],
  links: [],
  reservations: [
    {
      id: 'res_1', placeId: 'plc_fushimi', reservationDate: '2026-11-18', reservationTime: '05:30',
      confirmationNumber: 'GYG-7HQ2K9', status: 'confirmed', partySize: 3, bookingPlatform: 'GetYourGuide',
      bookingUrl: 'https://www.getyourguide.com/booking/1', specialRequests: 'Vegetarian', totalCost: '¥18,000',
      notes: 'Meet at the gate.', createdAt: '2026-09-30', updatedAt: '2026-09-30',
    },
  ],
  sources: [],
} as PlaceWithRelations

describe('Open 24 hours', () => {
  it('shows the option pressed for a 00:00-23:59 day instead of a blank end time', () => {
    const onChange = jest.fn()
    render(<HoursEditor value={week('00:00-23:59')} onChange={onChange} />)
    const toggle = screen.getByRole('button', { name: 'Open 24 hours' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('writes 00:00-23:59 for every selected day when Open 24 hours is turned on', async () => {
    const onChange = jest.fn()
    render(<HoursEditor value={{ monday: '09:00-17:00' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open 24 hours' }))
    expect(onChange).toHaveBeenCalledWith({ monday: '00:00-23:59' })
  })
})

describe('section pencils', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    window.localStorage.clear()
  })

  it('edits one section in place and autosaves without leaving the postcard', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    render(<PlacePage place={place} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Fushimi Inari-taisha' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "Edit About" }))

    const description = screen.getByLabelText('Description')
    expect(description).toHaveValue('Head shrine of Inari.')
    expect(screen.getByText('Editing')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Fushimi Inari-taisha' })).toBeInTheDocument()

    await userEvent.clear(description)
    await userEvent.type(description, 'A mountain of gates.')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 2000 })
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))
    expect(body.description).toBe('A mountain of gates.')
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/places/plc_fushimi')

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Head shrine of Inari.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()
  })

  it('saves a pencil edit still inside the debounce before global Edit seeds the editor', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    render(<PlacePage place={place} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit About' }))
    const description = screen.getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'A mountain of gates.')
    expect(fetchMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getAllByRole('button', { name: /^Edit$/ })[0])

    expect(await screen.findByText('Seeded description: A mountain of gates.')).toBeInTheDocument()
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(bodies.at(-1)).toEqual({ description: 'A mountain of gates.' })
  })

  it('shows a refreshed value in the pencil editor after the place changes underneath it', async () => {
    const { rerender } = render(<PlacePage place={place} />)
    rerender(<PlacePage place={{ ...place, practicalInfo: 'Bring water.' }} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit Good to know' }))
    expect(screen.getByDisplayValue('Bring water.')).toBeInTheDocument()
  })

  it('takes a refreshed value while another section is open and seeds global Edit with it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const { rerender } = render(<PlacePage place={place} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit Your plan' }))
    rerender(<PlacePage place={{ ...place, description: 'Saved in the full editor.' }} />)

    await userEvent.click(screen.getAllByRole('button', { name: /^Edit$/ })[0])
    expect(await screen.findByText('Seeded description: Saved in the full editor.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps typed pencil text over a refresh that has not caught up yet', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const { rerender } = render(<PlacePage place={place} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit About' }))
    const description = screen.getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'Typed here.')
    rerender(<PlacePage place={{ ...place, practicalInfo: 'Bring water.' }} />)
    expect(screen.getByLabelText('Description')).toHaveValue('Typed here.')

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Good to know' }))
    expect(screen.getByDisplayValue('Bring water.')).toBeInTheDocument()
  })

  it('opens the matching section editor from a Make it yours invitation', async () => {
    const sparse = { ...place, notes: null, description: null, altNames: [], attachments: [] } as PlaceWithRelations
    render(<PlacePage place={sparse} />)

    await userEvent.click(screen.getByRole('button', { name: /Describe it/ }))
    expect(screen.getByLabelText('Description')).toHaveValue('')
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: /Why did you save it/ }))
    expect(screen.getByLabelText('Your note')).toHaveValue('')
  })

  it('opens the existing editor when the page is asked to start in edit mode', async () => {
    render(<PlacePage place={place} startInEdit />)
    expect(await screen.findByText('Editing: Fushimi Inari-taisha')).toBeInTheDocument()
  })

  it('opens the existing editor when the user prefers edit mode', async () => {
    window.localStorage.setItem('user-preferences', JSON.stringify({ openPlacesInEditMode: true }))
    render(<PlacePage place={place} />)
    expect(await screen.findByText('Editing: Fushimi Inari-taisha')).toBeInTheDocument()
  })

  it('keeps view mode when the preference is off', () => {
    window.localStorage.setItem('user-preferences', JSON.stringify({ openPlacesInEditMode: false }))
    render(<PlacePage place={place} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Fushimi Inari-taisha' })).toBeInTheDocument()
    expect(screen.queryByText(/Editing:/)).not.toBeInTheDocument()
  })
})

describe('reservation editing', () => {
  it('patches an existing reservation from the editor that already had the unused edit state', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<ReservationsSection place={place} />)
    await userEvent.click(screen.getByRole('button', { name: /Edit reservation/ }))
    const confirmation = screen.getByLabelText('Confirmation Number')
    expect(confirmation).toHaveValue('GYG-7HQ2K9')
    await userEvent.clear(confirmation)
    await userEvent.type(confirmation, 'NEW-1')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/places/plc_fushimi/reservations/res_1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.confirmationNumber).toBe('NEW-1')
  })

  it('seeds and patches party size, booking URL, special requests and total cost through the full-view form', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<ReservationsSection place={place} />)
    await userEvent.click(screen.getByRole('button', { name: /Edit reservation/ }))

    expect(screen.getByLabelText('Party Size')).toHaveValue(3)
    expect(screen.getByLabelText('Booking URL')).toHaveValue('https://www.getyourguide.com/booking/1')
    expect(screen.getByLabelText('Special Requests')).toHaveValue('Vegetarian')
    expect(screen.getByLabelText('Total Cost')).toHaveValue('¥18,000')

    await userEvent.clear(screen.getByLabelText('Party Size'))
    await userEvent.type(screen.getByLabelText('Party Size'), '5')
    await userEvent.clear(screen.getByLabelText('Total Cost'))
    await userEvent.type(screen.getByLabelText('Total Cost'), '$210.00')
    await userEvent.clear(screen.getByLabelText('Booking URL'))
    await userEvent.type(screen.getByLabelText('Booking URL'), 'https://example.com/new')
    await userEvent.clear(screen.getByLabelText('Special Requests'))
    await userEvent.type(screen.getByLabelText('Special Requests'), 'Window seat')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/places/plc_fushimi/reservations/res_1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.partySize).toBe(5)
    expect(body.totalCost).toBe('$210.00')
    expect(body.bookingUrl).toBe('https://example.com/new')
    expect(body.specialRequests).toBe('Window seat')
  })
})

describe('full-view reservation saves', () => {
  it('closes and clears the form after adding, so a second Save cannot post a duplicate', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    mockRefresh.mockClear()

    render(<ReservationsSection place={place} />)
    await userEvent.click(screen.getByRole('button', { name: /Add Reservation/ }))
    await userEvent.type(screen.getByLabelText('Date'), '2026-12-01')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(mockRefresh).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Add Reservation/ }))
    expect(screen.getByLabelText('Date')).toHaveValue('')
  })

  it('passes refreshed reservations to the open global editor', async () => {
    const { rerender } = render(<PlacePage place={place} />)
    await userEvent.click(screen.getAllByRole('button', { name: /^Edit$/ })[0])
    expect(await screen.findByText('Reservations in editor: 1')).toBeInTheDocument()

    rerender(<PlacePage place={{ ...place, reservations: [] }} />)
    expect(screen.getByText('Reservations in editor: 0')).toBeInTheDocument()
  })
})

describe('placeEditHref', () => {
  it('points Inbox and Review at the place editor', () => {
    expect(placeEditHref('plc_1')).toBe('/place/plc_1?edit=1')
  })
})

void act
