import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewCheckPanel } from '@/components/review/review-check-panel'
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
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=')
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
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Forks, Washington' }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toMatchObject({ city: 'Forks' })
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
