import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { CollectionPlaceItem } from '@/components/collections/collection-place-item'
import { CollectionStats } from '@/components/collections/collection-stats'
import type { Place } from '@/types/database'

describe('collection itinerary mobile readability', () => {
  it('shows the full place name instead of a truncated fragment', () => {
    const place = {
      id: 'plc_1',
      name: 'Kinkaku-ji Temple',
      kind: 'landmark',
      status: 'library',
      city: 'Kyoto',
      country: 'Japan',
    } as Place

    render(
      <DndContext>
        <CollectionPlaceItem place={place} index={0} />
      </DndContext>,
    )

    expect(screen.getByText('Kinkaku-ji Temple')).toBeInTheDocument()
    expect(screen.queryByText(/Kink…|Ki\.\.\./)).not.toBeInTheDocument()
  })

  it('renders the Total Distance label and value in full', () => {
    const places = [
      {
        id: 'plc_a',
        name: 'Kinkaku-ji Temple',
        kind: 'landmark',
        status: 'library',
        coords: { lat: 35.0394, lon: 135.7292 },
      },
      {
        id: 'plc_b',
        name: 'Ichiran Ramen Shibuya',
        kind: 'restaurant',
        status: 'library',
        coords: { lat: 35.6614, lon: 139.7005 },
      },
    ] as Place[]

    render(<CollectionStats places={places} />)

    expect(screen.getByText('Total Distance')).toBeInTheDocument()
    expect(screen.getByText(/\d+\.\d+ km/)).toBeInTheDocument()
  })
})
