import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryMapView } from '@/components/library/library-map-view'
import { LibraryActionsProvider, type LibraryActions } from '@/components/library/library-actions'
import type { CoverStats } from '@/components/library/library-cover'
import { item } from '../helpers/library-items'

// The real map needs WebGL; the layout, chip and legend this suite checks all
// render around it.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicMock() {
    return <div data-testid="map-stub" />
  },
}))

const actions: LibraryActions = {
  hearts: new Set(),
  toggleHeart: jest.fn(),
  selected: new Set(),
  selecting: false,
  toggleSelect: jest.fn(),
  select: jest.fn(),
  activate: jest.fn(),
  openPlace: jest.fn(),
  archive: jest.fn(),
  remove: jest.fn(),
  addToCollection: jest.fn(),
  findImage: jest.fn(),
}

const items = [
  item({ id: 'plc_been', name: 'Been there', visitStatus: 'visited', lat: 35.0, lon: 135.7 }),
  item({ id: 'plc_planned', name: 'Going there', visitStatus: 'planned', lat: 34.9, lon: 135.8 }),
  item({ id: 'plc_dreaming', name: 'One day', visitStatus: 'not_visited' }),
]

const stats: CoverStats = {
  total: 3,
  countries: 1,
  cities: 1,
  been: 1,
  planned: 1,
  dreaming: 1,
  passport: [{ country: 'Japan', flag: '🇯🇵', been: true }],
}

function renderView() {
  return render(
    <LibraryActionsProvider value={actions}>
      <LibraryMapView chapters={[{ key: 'all', title: 'All', items }]} items={items} siblings={items.map((p) => p.id)} stats={stats} />
    </LibraryActionsProvider>
  )
}

describe('LibraryMapView layout', () => {
  it('is a flex column below lg so the map (order-1) renders above the list (order-2)', () => {
    const { container } = renderView()
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('flex')
    expect(wrapper.className).toContain('flex-col')
    expect(wrapper.className).toContain('lg:grid')
  })

  it('keeps the "N of M on the map" chip off the Mapbox wordmark corner', () => {
    renderView()
    const chip = screen.getByText('2 of 3 on the map')
    expect(chip.className).toContain('top-3')
    expect(chip.className).toContain('left-3')
    expect(chip.className).not.toContain('bottom-3')
  })
})

describe('LibraryMapView selection', () => {
  it('passes shift-click through so a range can be selected', async () => {
    const user = userEvent.setup()
    const activate = jest.fn()
    const siblings = items.map((p) => p.id)
    render(
      <LibraryActionsProvider value={{ ...actions, selecting: true, activate }}>
        <LibraryMapView chapters={[{ key: 'all', title: 'All', items }]} items={items} siblings={siblings} stats={stats} />
      </LibraryActionsProvider>
    )
    const row = (id: string) => {
      const el = document.querySelector<HTMLButtonElement>(`button[data-place-id="${id}"]`)
      if (!el) throw new Error(`missing row ${id}`)
      return el
    }
    await user.click(row('plc_been'))
    await user.keyboard('{Shift>}')
    await user.click(row('plc_dreaming'))
    await user.keyboard('{/Shift}')
    expect(activate).toHaveBeenNthCalledWith(1, 'plc_been', siblings, { shiftKey: false })
    expect(activate).toHaveBeenLastCalledWith('plc_dreaming', siblings, { shiftKey: true })
  })
})

describe('LibraryMapView status colours', () => {
  it('paints the Planned legend dot with the dedicated --map-planned token, not bg-accent', () => {
    const { container } = renderView()
    const dots = [...container.querySelectorAll('i')]
    const plannedDot = dots.find((d) => d.className.includes('--map-planned'))
    expect(plannedDot).toBeDefined()
    expect(dots.some((d) => d.className.includes('bg-accent'))).toBe(false)
  })

  it('lines the list badges up with the map pins: Been = primary, Planned = --map-planned', () => {
    renderView()
    const beenBadge = screen.getByText('Been')
    expect(beenBadge.className).toContain('bg-primary')
    const plannedBadge = screen.getAllByText('Planned').find((el) => el.className.includes('rounded-full'))
    expect(plannedBadge).toBeDefined()
    expect(plannedBadge!.className).toContain('bg-[hsl(var(--map-planned))]')
    expect(plannedBadge!.className).toContain('text-[hsl(var(--map-planned-foreground))]')
    expect(plannedBadge!.className).not.toContain('text-white')
    expect(plannedBadge!.className).not.toContain('bg-accent')
  })
})
