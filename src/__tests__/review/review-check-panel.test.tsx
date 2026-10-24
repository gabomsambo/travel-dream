import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewCheckPanel } from '@/components/review/review-check-panel'
import { PlaceView } from '@/components/places/place-view/place-view'
import type { PlaceWithRelations } from '@/types/database'

function place(overrides: Partial<PlaceWithRelations> = {}): PlaceWithRelations {
  return {
    id: 'plc_review',
    userId: 'user_review',
    name: "Gail's Bakery",
    kind: 'cafe',
    city: 'London',
    country: 'United Kingdom',
    admin: null,
    coords: { lat: 51.5, lon: -0.12 },
    address: null,
    googlePlaceId: null,
    altNames: [],
    description: null,
    tags: [],
    vibes: [],
    ratingSelf: 0,
    notes: null,
    status: 'inbox',
    confidence: 0.94,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    createdAt: '2026-10-18T12:00:00.000Z',
    updatedAt: '2026-10-18T12:00:00.000Z',
    archivedAt: null,
    website: null,
    phone: null,
    email: null,
    hours: null,
    visitStatus: 'not_visited',
    priority: 0,
    lastVisited: null,
    plannedVisit: null,
    recommendedBy: null,
    companions: null,
    practicalInfo: null,
    attachments: [],
    links: [],
    reservations: [],
    sources: [],
    collections: [],
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ReviewCheckPanel', () => {
  const fetchMock = global.fetch as jest.Mock

  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('says nothing to check when the rules are quiet', () => {
    render(<ReviewCheckPanel place={place()} onRename={jest.fn()} onUpdated={jest.fn()} />)
    expect(screen.getByText('Nothing to check')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Look up this place/ })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('searches for a branch only after the tap, one request per tap', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(json({
      candidates: [
        { googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' },
        { googlePlaceId: 'stub-gails-chelsea', name: "Gail's Bakery", detail: "King's Rd, London SW3" },
      ],
      unavailable: false,
    }))
    render(<ReviewCheckPanel place={place({ coords: null })} onRename={jest.fn()} onUpdated={jest.fn()} />)
    expect(screen.getByText('Which one?')).toBeInTheDocument()
    expect(screen.getByText('1 thing to check')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    expect(await screen.findByText('91 Lordship Ln, London SE22')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/branches?')
    expect(new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost').searchParams.get('q')).toBe("Gail's Bakery, London, United Kingdom")
  })

  it('loads a city suggestion from the pin and saves the town the user picks', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/city-suggestion')) {
        return json({
          suggestion: { locality: 'Forks', admin: 'Washington', country: 'United States', areaLabel: 'Olympic National Park' },
          unavailable: false,
        })
      }
      if (init?.method === 'PATCH') return json({ status: 'success' })
      return json({ message: 'unexpected' }, 500)
    })
    render(
      <ReviewCheckPanel
        place={place({
          name: 'Hall of Mosses',
          kind: 'natural',
          city: null,
          admin: 'Washington',
          country: 'United States',
          coords: { lat: 47.86, lon: -123.93 },
        })}
        onRename={jest.fn()}
        onUpdated={onUpdated}
      />
    )
    expect(await screen.findByText(/Olympic National Park, Washington/)).toBeInTheDocument()
    expect(screen.getByText('No city')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave it as Washington' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Forks, Washington' }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toMatchObject({ city: 'Forks' })
  })

  it('fills a whitespace city, admin, and country from the chosen branch', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        return json({
          candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London' }],
          unavailable: false,
        })
      }
      if (url.includes('/pin')) {
        return json({
          pin: {
            googlePlaceId: 'stub-gails-dulwich',
            name: "Gail's Bakery",
            address: '',
            city: 'London',
            admin: 'England',
            country: 'United Kingdom',
            coords: { lat: 51.45, lon: -0.07 },
          },
          unavailable: false,
        })
      }
      if (init?.method === 'PATCH') return json({ status: 'success' })
      return json({ message: 'unexpected' }, 500)
    })
    render(
      <ReviewCheckPanel
        place={place({ coords: null, city: ' ', admin: ' ', country: ' ' })}
        onRename={jest.fn()}
        onUpdated={onUpdated}
      />
    )
    expect(screen.getByText('Where is it?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    expect(new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost').searchParams.get('q')).toBe("Gail's Bakery")
    await user.click(await screen.findByText('91 Lordship Ln, London'))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
      coords: { lat: 51.45, lon: -0.07 },
      googlePlaceId: 'stub-gails-dulwich',
      city: 'London',
      admin: 'England',
      country: 'United Kingdom',
    })
  })

  it('keeps a real city and still fills a blank region from the chosen branch', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        return json({
          candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London' }],
          unavailable: false,
        })
      }
      if (url.includes('/pin')) {
        return json({
          pin: {
            googlePlaceId: 'stub-gails-dulwich',
            name: "Gail's Bakery",
            address: null,
            city: 'London',
            admin: 'England',
            country: 'United Kingdom',
            coords: { lat: 51.45, lon: -0.07 },
          },
          unavailable: false,
        })
      }
      if (init?.method === 'PATCH') return json({ status: 'success' })
      return json({ message: 'unexpected' }, 500)
    })
    render(
      <ReviewCheckPanel
        place={place({ coords: null, city: 'Paris', admin: ' ', country: null })}
        onRename={jest.fn()}
        onUpdated={onUpdated}
      />
    )
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    await user.click(await screen.findByText('91 Lordship Ln, London'))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    const body = JSON.parse(String((patch?.[1] as RequestInit).body)) as Record<string, unknown>
    expect(body.city).toBeUndefined()
    expect(body.admin).toBe('England')
    expect(body.country).toBe('United Kingdom')
    expect(body.address).toBeUndefined()
  })

  it('fills a whitespace region when the suggested town is saved', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/city-suggestion')) {
        return json({
          suggestion: { locality: 'Forks', admin: 'Washington', country: 'United States', areaLabel: 'Olympic National Park' },
          unavailable: false,
        })
      }
      if (init?.method === 'PATCH') return json({ status: 'success' })
      return json({ message: 'unexpected' }, 500)
    })
    render(
      <ReviewCheckPanel
        place={place({
          name: 'Hall of Mosses',
          kind: 'natural',
          city: ' ',
          admin: ' ',
          country: ' ',
          coords: { lat: 47.86, lon: -123.93 },
        })}
        onRename={jest.fn()}
        onUpdated={onUpdated}
      />
    )
    await user.click(await screen.findByRole('button', { name: 'Forks, Washington' }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
      city: 'Forks',
      admin: 'Washington',
      country: 'United States',
    })
  })

  it('does not offer leave-it-as when the region is blank', async () => {
    fetchMock.mockResolvedValue(json({ suggestion: null }))
    render(
      <ReviewCheckPanel
        place={place({
          city: ' ',
          admin: ' ',
          coords: { lat: 47.86, lon: -123.93 },
        })}
        onRename={jest.fn()}
        onUpdated={jest.fn()}
      />
    )
    expect(await screen.findByText('No city')).toBeInTheDocument()
    expect(screen.getByText('1 thing to check')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Leave it as/ })).not.toBeInTheDocument()
  })

  it('drops the branch list when the name, city, or country changes', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(json({
      candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
      unavailable: false,
    }))
    let current = place({ coords: null })
    const { rerender } = render(<ReviewCheckPanel place={current} onRename={jest.fn()} onUpdated={jest.fn()} />)
    const showList = async () => {
      await user.click(screen.getByRole('button', { name: /Look up this place/ }))
      expect(await screen.findByText('91 Lordship Ln, London SE22')).toBeInTheDocument()
    }
    await showList()
    for (const overrides of [{ name: 'Tartine' }, { city: 'Paris' }, { country: 'France' }]) {
      current = place({ ...current, ...overrides })
      rerender(<ReviewCheckPanel place={current} onRename={jest.fn()} onUpdated={jest.fn()} />)
      expect(screen.queryByText('91 Lordship Ln, London SE22')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Look up this place/ })).toBeInTheDocument()
      await showList()
    }
  })

  it('ignores a branch lookup that returns after the name changes', async () => {
    const user = userEvent.setup()
    let resolveSearch: (value: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      resolveSearch = resolve
    }))
    const { rerender } = render(
      <ReviewCheckPanel place={place({ coords: null })} onRename={jest.fn()} onUpdated={jest.fn()} />
    )
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Looking up/ })).toBeInTheDocument()

    rerender(
      <ReviewCheckPanel
        place={place({ coords: null, name: 'Tartine' })}
        onRename={jest.fn()}
        onUpdated={jest.fn()}
      />
    )
    expect(screen.getByText(/Tartine may have more than one location/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Look up this place/ })).toBeInTheDocument()

    await act(async () => {
      resolveSearch(json({
        candidates: [{ googlePlaceId: 'stub-gails', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
        unavailable: false,
      }))
    })
    expect(screen.queryByText('91 Lordship Ln, London SE22')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Gail's Bakery" })).not.toBeInTheDocument()

    fetchMock.mockResolvedValue(json({
      candidates: [{ googlePlaceId: 'stub-tartine', name: 'Tartine', detail: '600 Guerrero St, San Francisco' }],
      unavailable: false,
    }))
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    expect(await screen.findByText('600 Guerrero St, San Francisco')).toBeInTheDocument()
  })

  it('does not save a branch chosen before the name changes', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    let resolvePin: (value: Response) => void = () => {}
    let resolveNextSearch: (value: Response) => void = () => {}
    let branchLookups = 0
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        branchLookups += 1
        if (branchLookups === 1) {
          return Promise.resolve(json({
            candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
            unavailable: false,
          }))
        }
        return new Promise((resolve) => {
          resolveNextSearch = resolve
        })
      }
      if (url.includes('/pin')) {
        return new Promise((resolve) => {
          resolvePin = resolve
        })
      }
      if (init?.method === 'PATCH') return Promise.resolve(json({ status: 'success' }))
      return Promise.resolve(json({ message: 'unexpected' }, 500))
    })

    const { rerender } = render(
      <ReviewCheckPanel place={place({ coords: null })} onRename={jest.fn()} onUpdated={onUpdated} />
    )
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    await user.click(await screen.findByText('91 Lordship Ln, London SE22'))
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/pin'))).toBe(true))

    rerender(
      <ReviewCheckPanel
        place={place({ coords: null, name: 'Tartine' })}
        onRename={jest.fn()}
        onUpdated={onUpdated}
      />
    )
    expect(screen.getByText(/Tartine may have more than one location/)).toBeInTheDocument()
    expect(screen.queryByText('91 Lordship Ln, London SE22')).not.toBeInTheDocument()
    const lookup = screen.getByRole('button', { name: /Look up this place/ })
    expect(lookup).toBeEnabled()

    await user.click(lookup)
    expect(screen.getByRole('button', { name: /Looking up/ })).toBeInTheDocument()

    await act(async () => {
      resolvePin(json({
        pin: {
          googlePlaceId: 'stub-gails-dulwich',
          name: "Gail's Bakery",
          address: '91 Lordship Ln',
          city: 'London',
          admin: 'England',
          country: 'United Kingdom',
          coords: { lat: 51.45, lon: -0.07 },
        },
        unavailable: false,
      }))
    })

    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')).toBe(false)
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Looking up/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await act(async () => {
      resolveNextSearch(json({
        candidates: [{ googlePlaceId: 'stub-tartine', name: 'Tartine', detail: '600 Guerrero St, San Francisco' }],
        unavailable: false,
      }))
    })
    expect(await screen.findByText('600 Guerrero St, San Francisco')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')).toBe(false)
  })

  it.each<[string, Partial<PlaceWithRelations>, boolean]>([
    ['region', { admin: 'Oregon' }, true],
    ['street address', { address: '123 New St' }, true],
    ['pin', { coords: { lat: 45.52, lon: -122.67 } }, false],
  ])('does not save a branch chosen before the %s changes', async (_label, overrides, listStays) => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    let resolvePin: (value: Response) => void = () => {}
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        return Promise.resolve(json({
          candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
          unavailable: false,
        }))
      }
      if (url.includes('/pin')) {
        return new Promise((resolve) => {
          resolvePin = resolve
        })
      }
      if (init?.method === 'PATCH') return Promise.resolve(json({ status: 'success' }))
      return Promise.resolve(json({ message: 'unexpected' }, 500))
    })

    const initial = place({ coords: null })
    const { rerender } = render(
      <ReviewCheckPanel place={initial} onRename={jest.fn()} onUpdated={onUpdated} />
    )
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    await user.click(await screen.findByText('91 Lordship Ln, London SE22'))
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/pin'))).toBe(true))

    rerender(
      <ReviewCheckPanel
        place={place({ ...initial, ...overrides })}
        onRename={jest.fn()}
        onUpdated={onUpdated}
      />
    )
    if (listStays) {
      expect(screen.getByText('91 Lordship Ln, London SE22')).toBeInTheDocument()
      expect(screen.getByRole('listitem')).toBeEnabled()
    } else {
      expect(screen.queryByText('91 Lordship Ln, London SE22')).not.toBeInTheDocument()
    }

    await act(async () => {
      resolvePin(json({
        pin: {
          googlePlaceId: 'stub-gails-dulwich',
          name: "Gail's Bakery",
          address: '91 Lordship Ln',
          city: 'London',
          admin: 'England',
          country: 'United Kingdom',
          coords: { lat: 51.45, lon: -0.07 },
        },
        unavailable: false,
      }))
    })

    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')).toBe(false)
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('brings back a dismissed missing city when the region changes', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(json({ suggestion: null }))
    const initial = place({
      name: 'Hall of Mosses',
      kind: 'natural',
      city: null,
      admin: 'Washington',
      country: 'United States',
      coords: { lat: 47.86, lon: -123.93 },
    })
    const { rerender } = render(<ReviewCheckPanel place={initial} onRename={jest.fn()} onUpdated={jest.fn()} />)
    expect(await screen.findByRole('button', { name: 'Leave it as Washington' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave it as Washington' }))
    expect(screen.getByText('Nothing to check')).toBeInTheDocument()
    expect(screen.queryByText('No city')).not.toBeInTheDocument()

    rerender(
      <ReviewCheckPanel
        place={place({ ...initial, admin: 'Oregon' })}
        onRename={jest.fn()}
        onUpdated={jest.fn()}
      />
    )
    expect(await screen.findByRole('button', { name: 'Leave it as Oregon' })).toBeInTheDocument()
    expect(screen.getByText('No city')).toBeInTheDocument()
    expect(screen.getByText('1 thing to check')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Leave it as Oregon' }))
    expect(screen.getByText('Nothing to check')).toBeInTheDocument()
    rerender(
      <ReviewCheckPanel
        place={place({ ...initial, admin: null })}
        onRename={jest.fn()}
        onUpdated={jest.fn()}
      />
    )
    expect(await screen.findByText('No city')).toBeInTheDocument()
    expect(screen.getByText('1 thing to check')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Leave it as/ })).not.toBeInTheDocument()
  })

  it('marks a shaky name and a tip', () => {
    render(
      <ReviewCheckPanel
        place={place({ confidence: 0.48, kind: 'tip', coords: null, city: null })}
        onRename={jest.fn()}
        onNotAPlace={jest.fn()}
        onUpdated={jest.fn()}
      />
    )
    expect(screen.getByText(/Is “Gail's Bakery” the right name/)).toBeInTheDocument()
    expect(screen.getByText('This looks like a tip, not a place')).toBeInTheDocument()
    expect(screen.getByText('4 things to check')).toBeInTheDocument()
  })
})

describe('PlaceView review dismissal', () => {
  const fetchMock = global.fetch as jest.Mock

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(json({ suggestion: null }))
  })

  function reviewPlace(current: PlaceWithRelations, onReviewPlaceUpdated: () => void = jest.fn(), editing = false) {
    return (
      <PlaceView
        place={current}
        editing={editing}
        trips={[]}
        alsoIn={[]}
        onEdit={jest.fn()}
        onPhotoAttached={jest.fn()}
        showMobileActionBar={false}
        showReviewChecks
        onReviewPlaceUpdated={onReviewPlaceUpdated}
      />
    )
  }

  it('shows the city marker again when the region that dismissed it changes', async () => {
    const user = userEvent.setup()
    const initial = place({
      name: 'Hall of Mosses',
      kind: 'natural',
      city: null,
      admin: 'Washington',
      country: 'United States',
      coords: { lat: 47.86, lon: -123.93 },
    })
    const { rerender } = render(reviewPlace(initial))
    expect(await screen.findByRole('button', { name: 'Leave it as Washington' })).toBeInTheDocument()
    expect(screen.getAllByText('No city').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Leave it as Washington' }))
    expect(screen.getByText('Nothing to check')).toBeInTheDocument()
    expect(screen.queryByText('No city')).not.toBeInTheDocument()

    rerender(reviewPlace(place({ ...initial, admin: null })))
    expect(screen.getAllByText('No city').length).toBeGreaterThan(0)
    expect(screen.getByText('1 thing to check')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to check')).not.toBeInTheDocument()
  })

  it.each([
    ['region', 'Region', 'Oregon'],
    ['street address', 'Address', '123 New St'],
    ['latitude', 'Latitude', '45.52'],
    ['city', 'City', 'Paris'],
    ['country', 'Country', 'France'],
  ])('does not save a branch chosen before the %s draft changes', async (_label, field, value) => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    let resolvePin: (value: Response) => void = () => {}
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        return Promise.resolve(json({
          candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
          unavailable: false,
        }))
      }
      if (url.includes('/pin')) {
        return new Promise((resolve) => {
          resolvePin = resolve
        })
      }
      if (init?.method === 'PATCH') return Promise.resolve(json({ status: 'success' }))
      return Promise.resolve(json({ message: 'unexpected' }, 500))
    })

    render(reviewPlace(place({ coords: null }), onUpdated))
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    await user.click(await screen.findByText('91 Lordship Ln, London SE22'))
    await waitFor(() => expect(screen.getByRole('listitem')).toBeDisabled())

    await user.click(screen.getByRole('button', { name: 'Edit On the ground' }))
    fireEvent.change(screen.getByRole('textbox', { name: field }), { target: { value } })

    expect(screen.getByRole('listitem')).toBeEnabled()
    expect(screen.getByText('91 Lordship Ln, London SE22')).toBeInTheDocument()

    await act(async () => {
      resolvePin(json({
        pin: {
          googlePlaceId: 'stub-gails-dulwich',
          name: "Gail's Bakery",
          address: '91 Lordship Ln',
          city: 'London',
          admin: 'England',
          country: 'United Kingdom',
          coords: { lat: 51.45, lon: -0.07 },
        },
        unavailable: false,
      }))
    })

    const branchSaves = fetchMock.mock.calls.filter((call) => {
      const init = call[1] as RequestInit | undefined
      return init?.method === 'PATCH' && String(init.body).includes('googlePlaceId')
    })
    expect(branchSaves).toHaveLength(0)
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not save a branch chosen before the name draft changes', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    let resolvePin: (value: Response) => void = () => {}
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        return Promise.resolve(json({
          candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
          unavailable: false,
        }))
      }
      if (url.includes('/pin')) {
        return new Promise((resolve) => {
          resolvePin = resolve
        })
      }
      if (init?.method === 'PATCH') return Promise.resolve(json({ status: 'success' }))
      return Promise.resolve(json({ message: 'unexpected' }, 500))
    })

    render(reviewPlace(place({ coords: null }), onUpdated, true))
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    await user.click(await screen.findByText('91 Lordship Ln, London SE22'))
    await waitFor(() => expect(screen.getByRole('listitem')).toBeDisabled())

    fireEvent.change(screen.getByRole('textbox', { name: 'Place name' }), { target: { value: 'Tartine' } })

    expect(screen.getByRole('listitem')).toBeEnabled()
    expect(screen.getByText('91 Lordship Ln, London SE22')).toBeInTheDocument()

    await act(async () => {
      resolvePin(json({
        pin: {
          googlePlaceId: 'stub-gails-dulwich',
          name: "Gail's Bakery",
          address: '91 Lordship Ln',
          city: 'London',
          admin: 'England',
          country: 'United Kingdom',
          coords: { lat: 51.45, lon: -0.07 },
        },
        unavailable: false,
      }))
    })

    const branchSaves = fetchMock.mock.calls.filter((call) => {
      const init = call[1] as RequestInit | undefined
      return init?.method === 'PATCH' && String(init.body).includes('googlePlaceId')
    })
    expect(branchSaves).toHaveLength(0)
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('saves a branch chosen after a draft edit when that edit is echoed back', async () => {
    const user = userEvent.setup()
    const onUpdated = jest.fn()
    let resolvePin: (value: Response) => void = () => {}
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/branches')) {
        return Promise.resolve(json({
          candidates: [{ googlePlaceId: 'stub-gails-dulwich', name: "Gail's Bakery", detail: '91 Lordship Ln, London SE22' }],
          unavailable: false,
        }))
      }
      if (url.includes('/pin')) {
        return new Promise((resolve) => {
          resolvePin = resolve
        })
      }
      if (init?.method === 'PATCH') return Promise.resolve(json({ status: 'success' }))
      return Promise.resolve(json({ message: 'unexpected' }, 500))
    })

    const initial = place({ coords: null, city: null, admin: null, country: null })
    const { rerender } = render(reviewPlace(initial, onUpdated, true))
    await user.click(screen.getByRole('button', { name: /Look up this place/ }))
    expect(await screen.findByText('91 Lordship Ln, London SE22')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit On the ground' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'City' }), { target: { value: 'Paris' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Region' }), { target: { value: 'Oregon' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Country' }), { target: { value: 'France' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Place name' }), { target: { value: 'Tartine' } })
    await user.click(screen.getByRole('listitem'))
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/pin'))).toBe(true))

    rerender(reviewPlace(place({
      ...initial,
      name: 'Tartine',
      city: 'Paris',
      admin: 'Oregon',
      country: 'France',
    }), onUpdated, true))
    expect(screen.queryByText('91 Lordship Ln, London SE22')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Look up this place/ })).toBeDisabled()

    await act(async () => {
      resolvePin(json({
        pin: {
          googlePlaceId: 'stub-gails-dulwich',
          name: "Gail's Bakery",
          address: '91 Lordship Ln',
          city: 'London',
          admin: 'England',
          country: 'United Kingdom',
          coords: { lat: 51.45, lon: -0.07 },
        },
        unavailable: false,
      }))
    })

    const branchSaves = fetchMock.mock.calls.filter((call) => {
      const init = call[1] as RequestInit | undefined
      return init?.method === 'PATCH' && String(init.body).includes('googlePlaceId')
    })
    expect(branchSaves).toHaveLength(1)
    const body = JSON.parse(String((branchSaves[0][1] as RequestInit).body)) as Record<string, unknown>
    expect(body.googlePlaceId).toBe('stub-gails-dulwich')
    expect(body.coords).toEqual({ lat: 51.45, lon: -0.07 })
    expect(body.city).toBeUndefined()
    expect(body.admin).toBeUndefined()
    expect(body.country).toBeUndefined()
    expect(onUpdated).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
