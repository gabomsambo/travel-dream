import { renderHook, act } from '@testing-library/react'
import { useBulkSelection, useConfidenceSelection } from '../use-bulk-selection'
import type { BulkSelectionItem } from '../use-bulk-selection'

// Mock place data for testing
const mockPlaces: Array<BulkSelectionItem & { confidence?: number }> = [
  { id: 'place-1', name: 'Barcelona Cathedral', confidence: 0.95 },
  { id: 'place-2', name: 'Park Güell', confidence: 0.88 },
  { id: 'place-3', name: 'Sagrada Família', confidence: 0.92 },
  { id: 'place-4', name: 'La Boqueria', confidence: 0.55 },
  { id: 'place-5', name: 'Casa Batlló', confidence: 0.78 },
]

describe('useBulkSelection', () => {
  it('initializes with empty selection', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    expect(result.current.selectedIds).toEqual([])
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.isSomeSelected).toBe(false)
  })

  it('can select individual items', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.selectItem('place-1')
    })

    expect(result.current.selectedIds).toEqual(['place-1'])
    expect(result.current.selectedCount).toBe(1)
    expect(result.current.isSelected('place-1')).toBe(true)
    expect(result.current.isSomeSelected).toBe(true)
  })

  it('can deselect individual items', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces, {
      initialSelection: ['place-1', 'place-2']
    }))

    act(() => {
      result.current.deselectItem('place-1')
    })

    expect(result.current.selectedIds).toEqual(['place-2'])
    expect(result.current.selectedCount).toBe(1)
    expect(result.current.isSelected('place-1')).toBe(false)
    expect(result.current.isSelected('place-2')).toBe(true)
  })

  it('can toggle items', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    // Toggle on
    act(() => {
      result.current.toggleItem('place-1')
    })

    expect(result.current.isSelected('place-1')).toBe(true)

    // Toggle off
    act(() => {
      result.current.toggleItem('place-1')
    })

    expect(result.current.isSelected('place-1')).toBe(false)
  })

  it('can select all items', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.selectAll()
    })

    expect(result.current.selectedIds).toHaveLength(5)
    expect(result.current.isAllSelected).toBe(true)
    expect(result.current.selectedCount).toBe(5)
  })

  it('can clear all selections', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces, {
      initialSelection: ['place-1', 'place-2', 'place-3']
    }))

    act(() => {
      result.current.selectNone()
    })

    expect(result.current.selectedIds).toEqual([])
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.isAllSelected).toBe(false)
    expect(result.current.isSomeSelected).toBe(false)
  })

  it('can select range of items', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.selectRange(1, 3) // indices 1 to 3
    })

    expect(result.current.selectedIds).toEqual(['place-2', 'place-3', 'place-4'])
    expect(result.current.selectedCount).toBe(3)
  })

  it('respects max selection limit', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces, {
      maxSelection: 2
    }))

    act(() => {
      result.current.selectItem('place-1')
      result.current.selectItem('place-2')
      result.current.selectItem('place-3') // Should be ignored
    })

    expect(result.current.selectedCount).toBe(2)
    expect(result.current.selectedIds).toEqual(['place-1', 'place-2'])
  })

  it('handles item click with modifiers', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    // Regular click - replaces selection
    act(() => {
      result.current.handleItemClick('place-1', 0, {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault: jest.fn()
      } as any)
    })

    expect(result.current.selectedIds).toEqual(['place-1'])

    // Ctrl+click - toggles selection
    act(() => {
      result.current.handleItemClick('place-2', 1, {
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        preventDefault: jest.fn()
      } as any)
    })

    expect(result.current.selectedIds).toEqual(['place-1', 'place-2'])

    // Shift+click - range selection
    act(() => {
      result.current.handleItemClick('place-4', 3, {
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        preventDefault: jest.fn()
      } as any)
    })

    expect(result.current.selectedIds).toEqual(['place-1', 'place-2', 'place-3', 'place-4'])
  })

  it('can select by predicate function', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.selectByPredicate((item: any) => item.name.includes('Casa'))
    })

    expect(result.current.selectedIds).toEqual(['place-5'])
  })

  it('returns selected items correctly', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.selectItem('place-1')
      result.current.selectItem('place-3')
    })

    const selectedItems = result.current.getSelectedItems()
    expect(selectedItems).toHaveLength(2)
    expect(selectedItems[0].id).toBe('place-1')
    expect(selectedItems[1].id).toBe('place-3')
  })

  it('can reset to initial state', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces, {
      initialSelection: ['place-1']
    }))

    act(() => {
      result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(5)

    act(() => {
      result.current.reset()
    })

    expect(result.current.selectedIds).toEqual(['place-1'])
    expect(result.current.selectedCount).toBe(1)
  })
})

describe('useConfidenceSelection', () => {
  it('can select high confidence items', () => {
    const { result } = renderHook(() => useConfidenceSelection(mockPlaces))

    act(() => {
      result.current.selectHighConfidence()
    })

    // Should select items with confidence >= 0.9
    expect(result.current.selectedIds).toEqual(['place-1', 'place-3'])
    expect(result.current.selectedCount).toBe(2)
  })

  it('can select medium confidence items', () => {
    const { result } = renderHook(() => useConfidenceSelection(mockPlaces))

    act(() => {
      result.current.selectMediumConfidence()
    })

    // Should select items with confidence >= 0.8
    expect(result.current.selectedIds).toEqual(['place-1', 'place-2', 'place-3'])
    expect(result.current.selectedCount).toBe(3)
  })

  it('can select low confidence items', () => {
    const { result } = renderHook(() => useConfidenceSelection(mockPlaces))

    act(() => {
      result.current.selectLowConfidence()
    })

    // Should select items with confidence < 0.6
    expect(result.current.selectedIds).toEqual(['place-4'])
    expect(result.current.selectedCount).toBe(1)
  })

  it('auto-selects high confidence items', () => {
    const { result } = renderHook(() => useConfidenceSelection(mockPlaces))

    act(() => {
      result.current.autoSelectHighConfidence()
    })

    expect(result.current.selectedIds).toEqual(['place-1', 'place-3'])
  })

  it('handles items without confidence scores', () => {
    const itemsWithoutConfidence = [
      { id: 'place-1', name: 'Test Place 1' },
      { id: 'place-2', name: 'Test Place 2', confidence: 0.95 },
    ]

    const { result } = renderHook(() => useConfidenceSelection(itemsWithoutConfidence))

    act(() => {
      result.current.selectHighConfidence()
    })

    // Should only select place-2 which has high confidence
    expect(result.current.selectedIds).toEqual(['place-2'])
  })

  it('inherits all bulk selection functionality', () => {
    const { result } = renderHook(() => useConfidenceSelection(mockPlaces))

    // Test that basic bulk selection methods still work
    act(() => {
      result.current.selectItem('place-1')
    })

    expect(result.current.isSelected('place-1')).toBe(true)

    act(() => {
      result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(5)
  })
})

describe('BulkSelection edge cases', () => {
  it('handles empty items array', () => {
    const { result } = renderHook(() => useBulkSelection([]))

    expect(result.current.selectedCount).toBe(0)
    expect(result.current.isAllSelected).toBe(false)

    act(() => {
      result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(0)
  })

  it('handles invalid range selection', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.selectRange(-1, 10) // Invalid range
    })

    // Should clamp to valid range
    expect(result.current.selectedCount).toBe(5)
  })

  it('handles click on non-existent item', () => {
    const { result } = renderHook(() => useBulkSelection(mockPlaces))

    act(() => {
      result.current.handleItemClick('non-existent', 10, {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault: jest.fn()
      } as any)
    })

    // Should not crash or select anything
    expect(result.current.selectedCount).toBe(0)
  })

  it('maintains selection consistency when items change', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useBulkSelection(items),
      { initialProps: { items: mockPlaces.slice(0, 3) } }
    )

    act(() => {
      result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(3)

    // Update with more items
    rerender({ items: mockPlaces })

    // Selection should still be valid for existing items
    expect(result.current.selectedCount).toBe(3)
    expect(result.current.isAllSelected).toBe(false) // No longer all selected
  })
})