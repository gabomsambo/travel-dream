import React from 'react'
import { render } from '@testing-library/react'
import type { PlaceWithRelations } from '@/types/database'
import { MobileActionBar } from '@/components/places/place-view/mobile-action-bar'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}))
jest.mock('@/components/places/place-view/add-to-trip-menu', () => ({
  AddToTripMenu: () => <button type="button">Add to trip</button>,
}))

const place = {
  id: 'plc_fushimi',
  name: 'Fushimi Inari-taisha',
  city: 'Kyoto',
  coords: { lat: 34.9671, lon: 135.7727 },
  phone: null,
} as unknown as PlaceWithRelations

describe('MobileActionBar', () => {
  it('stretches past the scroller padding so no content shows beneath the bar', () => {
    const { container } = render(<MobileActionBar place={place} trips={[]} onChanged={() => {}} />)
    const bar = container.firstChild as HTMLElement
    // Phone padding is p-3, sm-to-lg (tablets) is p-6 — both offsets and both
    // negative margins must be present or the gap reappears on one of them.
    expect(bar.className).toContain('sticky')
    expect(bar.className).toContain('bottom-[-0.75rem]')
    expect(bar.className).toContain('-mb-3')
    expect(bar.className).toContain('sm:bottom-[-1.5rem]')
    expect(bar.className).toContain('sm:-mb-6')
    expect(bar.className).toContain('lg:hidden')
  })
})
