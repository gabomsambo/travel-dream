import { render, screen } from '@testing-library/react'
import { parseBestTime } from '@/lib/explore/best-time'
import type { ExplorePlace } from '@/lib/explore/types'
import { ExploreScope, scopePlaces } from '@/components/explore/explore-scope'
import { useExplore } from '@/components/explore/explore-provider'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

function place(id: string): ExplorePlace {
  return {
    id, name: id, kind: 'cafe', city: 'Lisbon', country: 'Portugal', description: null, notes: null, vibes: [],
    bestTimeText: null, bestTime: parseBestTime(null, null), recommendedBy: null, visitStatus: 'not_visited', priority: 0,
    ratingSelf: 0, priceLevel: null, createdAt: '2026-09-01 10:00:00', lat: null, lon: null, photos: [],
  }
}

const library = ['a', 'b', 'c', 'd', 'e'].map(place)

function Held() {
  const { places } = useExplore()
  return <p data-testid="held">{[...places.keys()].join(',')}</p>
}

describe('scopePlaces', () => {
  it('keeps the places named, in load order, and ignores ids the library does not hold', () => {
    expect(scopePlaces(library, ['d', 'b', 'nope']).map((p) => p.id)).toEqual(['b', 'd'])
  })

  it('accepts any iterable of ids', () => {
    expect(scopePlaces(library, new Set(['a', 'e'])).map((p) => p.id)).toEqual(['a', 'e'])
  })

  it('is empty for no ids', () => {
    expect(scopePlaces(library, [])).toEqual([])
  })

  it('at 5,000 places, only the ~250 rendered ids remain for the client payload', () => {
    const large = Array.from({ length: 5000 }, (_, i) => place(`p${i}`))
    const renderedIds = large.slice(0, 250).map((p) => p.id)
    const scoped = scopePlaces(large, renderedIds)
    expect(scoped).toHaveLength(250)
    expect(scoped.map((p) => p.id)).toEqual(renderedIds)
    const fullBytes = Buffer.byteLength(JSON.stringify(large))
    const scopedBytes = Buffer.byteLength(JSON.stringify(scoped))
    // Home Explore shows ≤ ~250 places; shipping only those must beat a whole-library serialize.
    expect(scopedBytes * 10).toBeLessThan(fullBytes)
  })
})

describe('ExploreScope', () => {
  it('gives the page only the places it renders', () => {
    render(
      <ExploreScope places={library} ids={['b', 'c']} collections={[]}>
        <Held />
      </ExploreScope>,
    )
    expect(screen.getByTestId('held')).toHaveTextContent('b,c')
  })
})
