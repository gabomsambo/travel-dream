import { render, screen } from '@testing-library/react'
import { parseBestTime } from '@/lib/explore/best-time'
import type { ExplorePlace } from '@/lib/explore/types'
import { loadExploreCached } from '@/lib/explore/load'
import ExplorePage from '@/app/(app)/explore/page'

jest.mock('@/lib/auth-helpers', () => ({
  requireAuth: jest.fn(async () => ({ id: 'user_1', name: 'Ada Lovelace', email: 'ada@example.com' })),
}))

jest.mock('@/lib/explore/load', () => ({
  loadExploreCached: jest.fn(),
}))

jest.mock('@/components/explore/explore-hero', () => ({
  ExploreHero: ({ stats }: { stats: string }) => <p>{stats}</p>,
}))

jest.mock('@/components/explore/rail-row', () => ({ RailRow: () => null }))
jest.mock('@/components/explore/trip-moment', () => ({ TripMoment: () => null }))
jest.mock('@/components/explore/browse-all', () => ({ BrowseAll: () => null }))
jest.mock('@/components/explore/explore-empty', () => ({ ExploreEmpty: () => <p>empty</p> }))
jest.mock('@/components/explore/atlas-strip', () => ({ AtlasStrip: () => null }))
jest.mock('@/components/explore/top-cities-rail', () => ({ TopCitiesRail: () => null }))

const mockLoad = loadExploreCached as jest.MockedFunction<typeof loadExploreCached>

function place(over: Partial<ExplorePlace> & Pick<ExplorePlace, 'id' | 'city' | 'country'>): ExplorePlace {
  return {
    name: over.id,
    kind: 'landmark',
    description: null,
    notes: null,
    vibes: [],
    bestTimeText: null,
    bestTime: parseBestTime(null, null),
    recommendedBy: null,
    visitStatus: 'not_visited',
    priority: 0,
    ratingSelf: 0,
    priceLevel: null,
    createdAt: '2026-09-01 10:00:00',
    lat: null,
    lon: null,
    photos: [],
    ...over,
  }
}

describe('Explore page city stat', () => {
  it('counts Lisbon and Lisboa as one city and keeps Rome, Georgia apart from Roma, Italy', async () => {
    mockLoad.mockResolvedValue({
      places: [
        place({ id: 'praca', city: 'Lisbon', country: 'Portugal' }),
        place({ id: 'miradouro', city: 'Lisboa', country: 'Portugal' }),
        place({ id: 'colosseo', city: 'Roma', country: 'Italy' }),
        place({ id: 'clock', city: 'Rome', country: 'Georgia' }),
      ],
      collections: [],
    })
    render(await ExplorePage())
    expect(screen.getByText('4 places · 3 countries · 3 cities')).toBeInTheDocument()
  })
})
