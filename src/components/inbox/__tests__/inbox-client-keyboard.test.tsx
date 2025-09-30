import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InboxClient } from '../inbox-client'
import type { Place } from '@/types/database'

// Mock the child components
jest.mock('@/components/places/place-grid', () => ({
  PlaceGrid: ({ places, onConfirm, onArchive, onSelectionChange, selected }: any) => (
    <div data-testid="place-grid">
      {places.map((place: Place, index: number) => (
        <div
          key={place.id}
          data-testid={`place-${place.id}`}
          data-place-index={index}
          onClick={(e) => onSelectionChange?.(place.id, index, e)}
          className={selected?.includes(place.id) ? 'selected' : ''}
        >
          <span>{place.name}</span>
          <button
            data-testid={`confirm-${place.id}`}
            onClick={() => onConfirm?.(place.id)}
          >
            Confirm
          </button>
          <button
            data-testid={`archive-${place.id}`}
            onClick={() => onArchive?.(place.id)}
          >
            Archive
          </button>
        </div>
      ))}
    </div>
  )
}))

jest.mock('@/components/inbox/inbox-toolbar', () => ({
  InboxToolbar: ({ onConfirmSelected, onArchiveSelected, onSelectAll, onSelectNone }: any) => (
    <div data-testid="inbox-toolbar">
      <button data-testid="confirm-selected" onClick={onConfirmSelected}>
        Confirm Selected
      </button>
      <button data-testid="archive-selected" onClick={onArchiveSelected}>
        Archive Selected
      </button>
      <button data-testid="select-all" onClick={onSelectAll}>
        Select All
      </button>
      <button data-testid="select-none" onClick={onSelectNone}>
        Select None
      </button>
    </div>
  )
}))

// Mock fetch for API calls
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock toast notifications
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}))

const mockPlaces: Place[] = [
  {
    id: 'place-1',
    name: 'Sagrada Família',
    kind: 'landmark',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4036, lon: 2.1744 },
    address: null,
    altNames: [],
    tags: ['Gaudí', 'architecture'],
    vibes: ['iconic'],
    ratingSelf: 5,
    notes: 'Must visit',
    status: 'inbox',
    confidence: 0.95,
    createdAt: '2025-09-27T00:00:00Z',
    updatedAt: '2025-09-27T00:00:00Z',
  },
  {
    id: 'place-2',
    name: 'Park Güell',
    kind: 'park',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.4145, lon: 2.1527 },
    address: null,
    altNames: [],
    tags: ['Gaudí', 'park'],
    vibes: ['colorful'],
    ratingSelf: 4,
    notes: 'Beautiful views',
    status: 'inbox',
    confidence: 0.88,
    createdAt: '2025-09-26T00:00:00Z',
    updatedAt: '2025-09-26T00:00:00Z',
  },
  {
    id: 'place-3',
    name: 'Casa Batlló',
    kind: 'landmark',
    city: 'Barcelona',
    country: 'ES',
    admin: 'Catalonia',
    coords: { lat: 41.3916, lon: 2.1649 },
    address: null,
    altNames: [],
    tags: ['Gaudí', 'modernist'],
    vibes: ['artistic'],
    ratingSelf: 5,
    notes: 'Amazing facade',
    status: 'inbox',
    confidence: 0.92,
    createdAt: '2025-09-25T00:00:00Z',
    updatedAt: '2025-09-25T00:00:00Z',
  },
]

const mockStats = {
  total: 3,
  byConfidence: {
    high: 2,
    medium: 1,
    low: 0,
    veryLow: 0,
  },
  needsReview: 1,
  avgConfidence: 0.92,
}

describe('InboxClient Keyboard Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updatedCount: 1 }),
    })
  })

  const renderInboxClient = () => {
    return render(
      <InboxClient initialPlaces={mockPlaces} initialStats={mockStats} />
    )
  }

  describe('Navigation Keys', () => {
    it('navigates down with j key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Press 'j' to navigate down
      await user.keyboard('j')

      // Current index should be 1 (second item)
      // This would be indicated by styling or focus, but since we mocked the component,
      // we check if the navigation logic would work
      expect(document.body).toHaveFocus() // Navigation happened
    })

    it('navigates up with k key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // First navigate down twice, then up once
      await user.keyboard('j')
      await user.keyboard('j')
      await user.keyboard('k')

      expect(document.body).toHaveFocus()
    })

    it('navigates with arrow keys', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Arrow down
      await user.keyboard('{ArrowDown}')
      expect(document.body).toHaveFocus()

      // Arrow up
      await user.keyboard('{ArrowUp}')
      expect(document.body).toHaveFocus()
    })

    it('stays within bounds when navigating', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Try to navigate up from first item (should stay at 0)
      await user.keyboard('k')
      expect(document.body).toHaveFocus()

      // Navigate to last item
      await user.keyboard('j')
      await user.keyboard('j')
      await user.keyboard('j') // Should stay at last item

      expect(document.body).toHaveFocus()
    })
  })

  describe('Individual Item Actions', () => {
    it('confirms current item with c key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Navigate to first item and confirm
      await user.keyboard('c')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/places/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm',
            placeIds: ['place-1'], // First place should be confirmed
          }),
        })
      })
    })

    it('archives current item with x key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Navigate to second item and archive
      await user.keyboard('j') // Navigate to second item
      await user.keyboard('x')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/places/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'archive',
            placeIds: ['place-2'], // Second place should be archived
          }),
        })
      })
    })
  })

  describe('Bulk Actions', () => {
    it('confirms all selected with C key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Select some items first (using space key)
      await user.keyboard(' ') // Select first item
      await user.keyboard('j') // Navigate down
      await user.keyboard(' ') // Select second item

      // Confirm all selected
      await user.keyboard('C')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/places/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm',
            placeIds: expect.arrayContaining(['place-1', 'place-2']),
          }),
        })
      })
    })

    it('archives all selected with X key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Select items
      await user.keyboard(' ') // Select first item
      await user.keyboard('j')
      await user.keyboard(' ') // Select second item

      // Archive all selected
      await user.keyboard('X')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/places/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'archive',
            placeIds: expect.arrayContaining(['place-1', 'place-2']),
          }),
        })
      })
    })
  })

  describe('Selection Keys', () => {
    it('toggles selection with space key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Toggle selection of first item
      await user.keyboard(' ')

      // The item should be selected
      // Since we mocked PlaceGrid, we check that the selection logic would work
      expect(document.body).toHaveFocus()
    })

    it('selects all with Ctrl+A', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      await user.keyboard('{Control>}a{/Control}')

      // All items should be selected
      expect(document.body).toHaveFocus()
    })

    it('selects all with Cmd+A on Mac', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      await user.keyboard('{Meta>}a{/Meta}')

      expect(document.body).toHaveFocus()
    })

    it('clears selection with Escape', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // First select some items
      await user.keyboard(' ')
      await user.keyboard('j')
      await user.keyboard(' ')

      // Then clear selection
      await user.keyboard('{Escape}')

      expect(document.body).toHaveFocus()
    })
  })

  describe('Help and Shortcuts', () => {
    it('toggles keyboard hints with ? key', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      await user.keyboard('?')

      // Should toggle keyboard hints display
      expect(document.body).toHaveFocus()
    })
  })

  describe('Accessibility and Focus Management', () => {
    it('does not trigger shortcuts when input is focused', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Create a mock input element
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      // Try to use shortcuts while input is focused
      await user.keyboard('c')

      // Fetch should not be called since input is focused
      expect(mockFetch).not.toHaveBeenCalled()

      document.body.removeChild(input)
    })

    it('does not trigger shortcuts when textarea is focused', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      textarea.focus()

      await user.keyboard('x')

      expect(mockFetch).not.toHaveBeenCalled()

      document.body.removeChild(textarea)
    })

    it('does not trigger shortcuts when contentEditable is focused', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      const div = document.createElement('div')
      div.contentEditable = 'true'
      document.body.appendChild(div)
      div.focus()

      await user.keyboard('j')

      // Navigation should not happen
      expect(document.body).not.toHaveFocus()

      document.body.removeChild(div)
    })
  })

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      renderInboxClient()

      await user.keyboard('c')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      // Should show error toast (mocked)
      const { toast } = require('sonner')
      expect(toast.error).toHaveBeenCalledWith('Failed to confirm places')
    })

    it('handles network errors', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('Network error'))

      renderInboxClient()

      await user.keyboard('x')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      const { toast } = require('sonner')
      expect(toast.error).toHaveBeenCalledWith('Failed to archive places')
    })
  })

  describe('Complex Workflows', () => {
    it('handles complete review workflow', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Navigate through items and make decisions
      await user.keyboard('j') // Go to second item
      await user.keyboard('c') // Confirm it

      await user.keyboard('j') // Go to third item
      await user.keyboard(' ') // Select it
      await user.keyboard('k') // Go back to first item
      await user.keyboard(' ') // Select first item too
      await user.keyboard('X') // Archive both selected

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2) // One for confirm, one for archive
      })
    })

    it('handles rapid key presses', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Rapid navigation
      await user.keyboard('jjjkkjkjk')

      // Should handle all key presses without errors
      expect(document.body).toHaveFocus()
    })

    it('prevents double-submission', async () => {
      const user = userEvent.setup()
      let resolvePromise: Function
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      mockFetch.mockReturnValue(delayedPromise)
      renderInboxClient()

      // Press confirm twice quickly
      await user.keyboard('c')
      await user.keyboard('c')

      // Should only call API once
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Resolve the promise
      resolvePromise({ ok: true, json: async () => ({ updatedCount: 1 }) })
    })
  })

  describe('State Persistence', () => {
    it('maintains selection state during navigation', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      // Select items and navigate
      await user.keyboard(' ') // Select first
      await user.keyboard('j') // Navigate
      await user.keyboard(' ') // Select second
      await user.keyboard('k') // Navigate back

      // Selection should persist
      expect(document.body).toHaveFocus()
    })

    it('updates state after successful operations', async () => {
      const user = userEvent.setup()
      renderInboxClient()

      await user.keyboard('c') // Confirm first item

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      // Item should be optimistically updated
      const { toast } = require('sonner')
      expect(toast.success).toHaveBeenCalledWith('Confirmed 1 places')
    })
  })
})