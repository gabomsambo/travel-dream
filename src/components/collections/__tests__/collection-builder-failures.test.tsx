import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useOptimistic: <T,>(state: T) => [state, jest.fn()],
}))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockPlacesList(props: {
    onNoteChange: (id: string, note: string) => void
    onTogglePin: (id: string) => void
  }) {
    return (
      <>
        <button onClick={() => props.onNoteChange('place-1', 'Remember this')}>Save note</button>
        <button onClick={() => props.onTogglePin('place-1')}>Toggle pin</button>
      </>
    )
  },
}))
jest.mock('../collection-map-context', () => ({ useCollectionMapContextOptional: () => null }))
jest.mock('../collection-map-renderer', () => ({ CollectionMapRenderer: () => null }))
jest.mock('../collection-stats', () => ({ CollectionStats: () => null }))
jest.mock('../add-places-dialog', () => ({ AddPlacesDialog: () => null }))
jest.mock('../share-dialog', () => ({ ShareDialog: () => null }))
jest.mock('../transport-mode-toggle', () => ({ TransportModeToggle: () => null }))

import { toast } from 'sonner'
import { CollectionBuilder } from '../collection-builder'

const toastError = toast.error as jest.MockedFunction<typeof toast.error>

const initialCollection = {
  id: 'collection-1',
  name: 'Barcelona',
  description: null,
  transportMode: 'drive' as const,
  places: [{ id: 'place-1', name: 'Sagrada Familia', isPinned: false, note: null }],
}

describe('CollectionBuilder save failures', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockReset().mockResolvedValue({ ok: false })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('reports a non-success transport settings response', async () => {
    render(<CollectionBuilder initialCollection={initialCollection as never} />)

    await act(async () => jest.advanceTimersByTime(1000))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to save transport mode'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/collections/collection-1/settings',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('reports a non-success note response', async () => {
    render(<CollectionBuilder initialCollection={initialCollection as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    await act(async () => jest.advanceTimersByTime(1000))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to save note'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/collections/collection-1/places/place-1/note',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('reports a non-success pin response', async () => {
    render(<CollectionBuilder initialCollection={initialCollection as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle pin' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to update pin status'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/collections/collection-1/places/place-1/pin',
      { method: 'PATCH' }
    )
  })
})
