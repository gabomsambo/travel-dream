import { render, screen, waitFor } from '@testing-library/react'
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

describe('PlaceSheet "Also in" when the page holds only what it renders', () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn()

  function answer(map: Record<string, ExplorePlace[]>) {
    fetchMock.mockImplementation(async (url: string) => {
      const id = decodeURIComponent(url.split('/').pop() ?? '')
      return { ok: id in map, json: async () => ({ places: map[id] ?? [] }) }
    })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterAll(() => {
    global.fetch = originalFetch
  })

  it('asks the server for the neighbours when the sheet opens, then shows them', async () => {
    answer({ miradouro: [praca] })
    render(
      <ExploreProvider places={[miradouro]} collections={[]} sameCity="fetch">
        <Open id="miradouro" />
      </ExploreProvider>,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Open miradouro' }))
    expect(await screen.findByRole('button', { name: 'Praça' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/explore/same-city/miradouro')
  })

  it('opens a neighbour the page does not hold, and looks up its neighbours in turn', async () => {
    answer({ miradouro: [praca], praca: [miradouro] })
    render(
      <ExploreProvider places={[miradouro]} collections={[]} sameCity="fetch">
        <Open id="miradouro" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open miradouro' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Praça' }))
    expect(await screen.findByRole('heading', { name: 'Praça' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/explore/same-city/praca', expect.anything()))
  })

  it('does not ask again for a place it already has the neighbours of', async () => {
    answer({ miradouro: [praca], praca: [miradouro] })
    render(
      <ExploreProvider places={[miradouro]} collections={[]} sameCity="fetch">
        <Open id="miradouro" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open miradouro' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Praça' }))
    await screen.findByRole('heading', { name: 'Praça' })
    await userEvent.click(await screen.findByRole('button', { name: 'Miradouro' }))
    await screen.findByRole('heading', { name: 'Miradouro' })
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/miradouro'))).toHaveLength(1)
  })

  it('skips the lookup for a place with no city', async () => {
    render(
      <ExploreProvider places={[place({ id: 'nowhere', name: 'Nowhere', city: null, country: null })]} collections={[]} sameCity="fetch">
        <Open id="nowhere" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open nowhere' }))
    expect(await screen.findByRole('heading', { name: 'Nowhere' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves the rail out when the lookup fails, and keeps the sheet usable', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(
      <ExploreProvider places={[miradouro]} collections={[]} sameCity="fetch">
        <Open id="miradouro" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open miradouro' }))
    expect(await screen.findByRole('heading', { name: 'Miradouro' })).toBeInTheDocument()
    expect(screen.queryByText(/Also in/)).not.toBeInTheDocument()
  })

  it('never asks the server when the page already holds the whole library', async () => {
    render(
      <ExploreProvider places={[praca, miradouro]} collections={[]}>
        <Open id="miradouro" />
      </ExploreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open miradouro' }))
    expect(await screen.findByRole('button', { name: 'Praça' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
