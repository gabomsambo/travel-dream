import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { parseBestTime } from '@/lib/explore/best-time'
import type { ExplorePlace } from '@/lib/explore/types'
import { ExploreProvider, useExplore } from '@/components/explore/explore-provider'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) as unknown as ReturnType<typeof useRouter>,
}))

function place(over: Partial<ExplorePlace> & Pick<ExplorePlace, 'id' | 'name' | 'city' | 'country'>): ExplorePlace {
  return {
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

const praca = place({ id: 'praca', name: 'Praça', city: 'Lisbon', country: 'Portugal' })
const miradouro = place({ id: 'miradouro', name: 'Miradouro', city: 'Lisboa', country: 'Portugal' })
const colosseo = place({ id: 'colosseo', name: 'Colosseo', city: 'Roma', country: 'Italy' })
const clocktower = place({ id: 'clock', name: 'Clocktower', city: 'Rome', country: 'Georgia' })

function Open({ id }: { id: string }) {
  const { openPlace } = useExplore()
  return (
    <button type="button" onClick={() => openPlace(id)}>
      Open {id}
    </button>
  )
}

describe('PlaceSheet city links', () => {
  it('opens the English atlas page for a stored exonym and keeps the other country out of Also in', async () => {
    render(
      <ExploreProvider places={[praca, miradouro, colosseo, clocktower]} collections={[]}>
        <Open id="miradouro" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open miradouro' }))
    expect(screen.getByRole('link', { name: 'Lisboa · Portugal' })).toHaveAttribute('href', '/explore/atlas/portugal/lisbon')
    expect(screen.getByRole('button', { name: 'Praça' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clocktower' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Colosseo' })).not.toBeInTheDocument()
  })

  it('links Roma to the Rome atlas page', async () => {
    render(
      <ExploreProvider places={[praca, miradouro, colosseo, clocktower]} collections={[]}>
        <Open id="colosseo" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open colosseo' }))
    expect(screen.getByRole('link', { name: 'Roma · Italy' })).toHaveAttribute('href', '/explore/atlas/italy/rome')
    expect(screen.queryByRole('button', { name: 'Clocktower' })).not.toBeInTheDocument()
  })
})
