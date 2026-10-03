import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseBestTime } from '@/lib/explore/best-time'
import type { ExplorePlace } from '@/lib/explore/types'
import { ExploreProvider } from '@/components/explore/explore-provider'
import { ShuffleDeck } from '@/components/explore/shuffle-deck'

jest.mock('framer-motion', () => {
  const React = require('react')
  const motion = new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        React.forwardRef(({ children, ...props }: { children?: React.ReactNode }, ref: unknown) =>
          React.createElement(prop === 'span' ? 'span' : 'div', { ...props, ref }, children)
        ),
    }
  )
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: () => ({ get: () => 0 }),
    useTransform: () => ({ get: () => 0 }),
    animate: jest.fn(),
  }
})

const place = (id: string, name: string): ExplorePlace => ({
  id,
  name,
  kind: 'landmark',
  city: 'Lisbon',
  country: 'Portugal',
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
  createdAt: '2024-01-01 00:00:00',
  lat: null,
  lon: null,
  photos: [{ uri: `https://example.com/${id}.jpg`, thumb: `https://example.com/${id}-t.jpg` }],
})

function renderDeck(deck: string[], collections: { id: string; name: string; placeIds: string[] }[] = []) {
  const places = deck.map((id, i) => place(id, `Place ${i + 1}`))
  return render(
    <ExploreProvider places={places} collections={collections}>
      <ShuffleDeck title="Everything" backHref="/explore" deck={deck} />
    </ExploreProvider>
  )
}

describe('ShuffleDeck', () => {
  beforeEach(() => {
    localStorage.clear()
    ;(global.fetch as jest.Mock)?.mockReset?.()
  })

  it('Done early lands on the end screen with dreams kept', async () => {
    renderDeck(['a', 'b', 'c'])
    await userEvent.click(screen.getByRole('button', { name: /Keep dreaming/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Finish shuffle early' }))
    expect(screen.getByText(/1 dream out of 1/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save 1 as a new collection/i })).toBeInTheDocument()
  })

})
