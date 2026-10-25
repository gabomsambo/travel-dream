import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressLink } from '@/components/map/address-link'
import type { PlaceWithRelations } from '@/types/database'

function place(coords: PlaceWithRelations['coords']): PlaceWithRelations {
  return {
    name: "Gail's Bakery",
    address: '91 Lordship Ln, London',
    coords,
  } as PlaceWithRelations
}

function mapsHref(): string {
  return screen.getByRole('link', { name: /91 Lordship Ln, London/ }).getAttribute('href') ?? ''
}

describe('AddressLink', () => {
  it('searches the street address when the stored pin is 0,0', async () => {
    const user = userEvent.setup()
    const open = jest.spyOn(window, 'open').mockImplementation(() => null)
    render(<AddressLink place={place({ lat: 0, lon: 0 })} />)
    const addressSearch = 'https://www.google.com/maps/search/?api=1&query=91%20Lordship%20Ln%2C%20London'
    expect(mapsHref()).toBe(addressSearch)
    await user.click(screen.getByRole('link', { name: /91 Lordship Ln, London/ }))
    expect(open).toHaveBeenCalledWith(addressSearch, '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('uses coordinates on the equator or the prime meridian', () => {
    const { rerender } = render(<AddressLink place={place({ lat: 0, lon: -0.12 })} />)
    expect(mapsHref()).toBe('https://www.google.com/maps/search/?api=1&query=0,-0.12')
    rerender(<AddressLink place={place({ lat: 51.5, lon: 0 })} />)
    expect(mapsHref()).toBe('https://www.google.com/maps/search/?api=1&query=51.5,0')
  })
})
