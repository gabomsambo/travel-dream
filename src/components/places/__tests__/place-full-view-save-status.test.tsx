import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PlaceFullView } from '../place-full-view'
import type { PlaceWithRelations } from '@/types/database'

// useOptimistic is a React 19 API; this project runs React 18 in tests.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useOptimistic: (initialState: unknown) => [initialState, jest.fn()],
}))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }),
}))

jest.mock('../place-full-view-sections/hero-section', () => ({
  HeroSection: ({ updateField }: { updateField: (field: string, value: string) => void }) => (
    <button data-testid="edit-name" onClick={() => updateField('name', `Edited ${Math.random()}`)}>
      edit name
    </button>
  ),
}))
jest.mock('../place-full-view-sections/location-section', () => ({ LocationSection: () => null }))
jest.mock('../place-full-view-sections/details-section', () => ({ DetailsSection: () => null }))
jest.mock('../place-full-view-sections/contact-section', () => ({ ContactSection: () => null }))
jest.mock('../place-full-view-sections/planning-section', () => ({ PlanningSection: () => null }))
jest.mock('../place-full-view-sections/notes-section', () => ({ NotesSection: () => null }))
jest.mock('../place-full-view-sections/reservations-section', () => ({ ReservationsSection: () => null }))
jest.mock('../place-full-view-sections/links-section', () => ({ LinksSection: () => null }))
jest.mock('../place-full-view-sections/media-section', () => ({ MediaSection: () => null }))
jest.mock('../place-full-view-sections/sources-section', () => ({ SourcesSection: () => null }))
jest.mock('../place-full-view-sections/metadata-section', () => ({ MetadataSection: () => null }))

const place = {
  id: 'plc_1',
  name: 'Test Place',
  kind: 'restaurant',
  attachments: [],
  sources: [],
  collections: [],
} as unknown as PlaceWithRelations

const SAVE_DEBOUNCE_MS = 800
const SAVED_LABEL_MS = 2000

function editAndFlushSave() {
  fireEvent.click(screen.getByTestId('edit-name'))
  return act(async () => {
    jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
  })
}

describe('PlaceFullView save status', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockRefresh.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('keeps a newer save failure visible after an older successful save times out', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'City must be a string' }),
      }) as unknown as typeof fetch

    render(<PlaceFullView initialPlace={place} />)

    await editAndFlushSave()
    expect(screen.getByText('Saved')).toBeInTheDocument()

    await editAndFlushSave()
    expect(screen.getByText('Save failed: City must be a string')).toBeInTheDocument()

    // The first save's "Saved" label timer is still pending here; it must not
    // clear the failure reported by the newer save.
    await act(async () => {
      jest.advanceTimersByTime(SAVED_LABEL_MS)
    })

    expect(screen.getByText('Save failed: City must be a string')).toBeInTheDocument()
  })

  it('clears its own saved label after the timeout', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch

    render(<PlaceFullView initialPlace={place} />)

    await editAndFlushSave()
    expect(screen.getByText('Saved')).toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(SAVED_LABEL_MS)
    })

    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
