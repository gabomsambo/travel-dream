import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlaceMap } from '@/components/places/place-view/place-map'

process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token'

let mockTheme: string | undefined = 'light'
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mockTheme }),
}))

const coords = { lat: 34.9671, lon: 135.7727 }

describe('PlaceMap', () => {
  it('uses the light Mapbox style in light mode', () => {
    mockTheme = 'light'
    const { container } = render(<PlaceMap coords={coords} kind="landmark" name="Fushimi Inari-taisha" />)
    expect(container.querySelector('img')!.src).toContain('/styles/v1/mapbox/light-v11/static/')
  })

  it('uses the dark Mapbox style in dark mode', () => {
    mockTheme = 'dark'
    const { container } = render(<PlaceMap coords={coords} kind="landmark" name="Fushimi Inari-taisha" />)
    expect(container.querySelector('img')!.src).toContain('/styles/v1/mapbox/dark-v11/static/')
  })

  it('shows the full static-image attribution: © Mapbox and © OpenStreetMap', () => {
    mockTheme = 'light'
    render(<PlaceMap coords={coords} kind="landmark" name="Fushimi Inari-taisha" />)
    expect(screen.getByRole('link', { name: '© Mapbox' })).toHaveAttribute('href', 'https://www.mapbox.com/about/maps/')
    expect(screen.getByRole('link', { name: '© OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('keeps the placeholder until the theme has resolved to light or dark', () => {
    mockTheme = undefined
    const { container } = render(<PlaceMap coords={coords} kind="landmark" name="Fushimi Inari-taisha" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link', { name: '© Mapbox' })).toBeNull()
  })

  it('shows the new style after a failed load when the theme changes', () => {
    mockTheme = 'dark'
    const view = render(<PlaceMap coords={coords} kind="landmark" name="Fushimi Inari-taisha" />)
    const failed = view.container.querySelector('img')
    expect(failed?.src).toContain('/styles/v1/mapbox/dark-v11/static/')
    fireEvent.error(failed!)
    expect(view.container.querySelector('img')).toBeNull()

    mockTheme = 'light'
    view.rerender(<PlaceMap coords={coords} kind="landmark" name="Fushimi Inari-taisha" />)
    const recovered = view.container.querySelector('img')
    expect(recovered).not.toBeNull()
    expect(recovered!.src).toContain('/styles/v1/mapbox/light-v11/static/')
  })
})
