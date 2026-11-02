import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapFilterBar } from '@/components/map/map-filter-bar'

const updateFilters = jest.fn()

jest.mock('@/components/map/map-context', () => ({
  useMapContext: () => ({
    collections: [],
    filters: {
      search: '',
      collectionId: null,
      kinds: [],
      showDayOverlay: false,
      showUnvisitedOnly: false,
      activeDays: [],
    },
    filteredPlaces: [],
    updateFilters,
    fitBounds: jest.fn(),
  }),
}))

describe('map filter chips touch targets', () => {
  beforeEach(() => {
    updateFilters.mockClear()
  })

  it('toggles a kind chip when its label is clicked', async () => {
    const user = userEvent.setup()
    render(<MapFilterBar />)

    await user.click(screen.getByRole('button', { name: /restaurant/i }))
    expect(updateFilters).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: expect.arrayContaining(['restaurant']) }),
    )
  })
})
