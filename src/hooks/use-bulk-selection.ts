"use client"

import { useState, useCallback, useMemo } from 'react'

export interface BulkSelectionItem {
  id: string
  [key: string]: any
}

export interface BulkSelectionHandlers<T extends BulkSelectionItem> {
  selectedIds: string[]
  selectedItems: T[]
  selectedCount: number
  isSelected: (id: string) => boolean
  isAllSelected: boolean
  isSomeSelected: boolean
  handleItemClick: (id: string, index: number, event: React.MouseEvent) => void
  selectItem: (id: string) => void
  deselectItem: (id: string) => void
  toggleItem: (id: string) => void
  selectAll: () => void
  selectNone: () => void
  selectRange: (startIndex: number, endIndex: number) => void
  selectByPredicate: (predicate: (item: T) => boolean) => void
  getSelectedItems: () => T[]
  reset: () => void
}

export interface BulkSelectionOptions {
  initialSelection?: string[]
  maxSelection?: number
  allowRangeSelection?: boolean
  allowToggleSelection?: boolean
}

export function useBulkSelection<T extends BulkSelectionItem>(
  items: T[],
  options: BulkSelectionOptions = {}
): BulkSelectionHandlers<T> {
  const {
    initialSelection = [],
    maxSelection,
    allowRangeSelection = true,
    allowToggleSelection = true
  } = options

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelection))
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // Memoized derived state
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds])
  const selectedCount = selectedIds.size
  const isAllSelected = items.length > 0 && selectedIds.size === items.length
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < items.length

  // Get selected items
  const selectedItems = useMemo(() => {
    return items.filter(item => selectedIds.has(item.id))
  }, [items, selectedIds])

  // Check if item is selected
  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id)
  }, [selectedIds])

  // Select single item
  const selectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (maxSelection && prev.size >= maxSelection && !prev.has(id)) {
        return prev // Don't exceed max selection
      }
      const newSet = new Set(prev)
      newSet.add(id)
      return newSet
    })
  }, [maxSelection])

  // Deselect single item
  const deselectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }, [])

  // Toggle single item
  const toggleItem = useCallback((id: string) => {
    if (selectedIds.has(id)) {
      deselectItem(id)
    } else {
      selectItem(id)
    }
  }, [selectedIds, selectItem, deselectItem])

  // Select all items
  const selectAll = useCallback(() => {
    const allIds = items.map(item => item.id)
    const idsToSelect = maxSelection
      ? allIds.slice(0, maxSelection)
      : allIds
    setSelectedIds(new Set(idsToSelect))
    setLastSelectedIndex(null)
  }, [items, maxSelection])

  // Clear all selections
  const selectNone = useCallback(() => {
    setSelectedIds(new Set())
    setLastSelectedIndex(null)
  }, [])

  // Select range of items
  const selectRange = useCallback((startIndex: number, endIndex: number) => {
    if (items.length === 0) return

    // Clamp indices to valid range
    const start = Math.max(0, Math.min(startIndex, endIndex))
    const end = Math.min(items.length - 1, Math.max(startIndex, endIndex))

    const rangeIds = items.slice(start, end + 1).map(item => item.id)

    setSelectedIds(prev => {
      const newSet = new Set(prev)
      rangeIds.forEach(id => {
        if (!maxSelection || newSet.size < maxSelection) {
          newSet.add(id)
        }
      })
      return newSet
    })
  }, [items, maxSelection])

  // Select items by predicate function
  const selectByPredicate = useCallback((predicate: (item: T) => boolean) => {
    const matchingIds = items.filter(predicate).map(item => item.id)

    setSelectedIds(prev => {
      const newSet = new Set(prev)
      matchingIds.forEach(id => {
        if (!maxSelection || newSet.size < maxSelection) {
          newSet.add(id)
        }
      })
      return newSet
    })
  }, [items, maxSelection])

  // Main click handler with support for Shift/Ctrl modifiers
  const handleItemClick = useCallback((id: string, index: number, event: React.MouseEvent) => {
    const item = items[index]
    if (!item || item.id !== id) {
      console.warn('Item index mismatch in bulk selection')
      return
    }

    // Handle Shift+click for range selection
    if (allowRangeSelection && event.shiftKey && lastSelectedIndex !== null) {
      event.preventDefault()
      selectRange(lastSelectedIndex, index)
      return
    }

    // Handle Ctrl/Cmd+click for toggle selection
    if (allowToggleSelection && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      toggleItem(id)
      setLastSelectedIndex(index)
      return
    }

    // Regular click - replace selection
    setSelectedIds(new Set([id]))
    setLastSelectedIndex(index)
  }, [
    items,
    lastSelectedIndex,
    allowRangeSelection,
    allowToggleSelection,
    selectRange,
    toggleItem
  ])

  // Get selected items (alias for selectedItems)
  const getSelectedItems = useCallback(() => selectedItems, [selectedItems])

  // Reset to initial state
  const reset = useCallback(() => {
    setSelectedIds(new Set(initialSelection))
    setLastSelectedIndex(null)
  }, [initialSelection])

  return {
    selectedIds: selectedIdsArray,
    selectedItems,
    selectedCount,
    isSelected,
    isAllSelected,
    isSomeSelected,
    handleItemClick,
    selectItem,
    deselectItem,
    toggleItem,
    selectAll,
    selectNone,
    selectRange,
    selectByPredicate,
    getSelectedItems,
    reset
  }
}

// Convenience hook for confidence-based selection
export function useConfidenceSelection<T extends BulkSelectionItem & { confidence?: number | null }>(
  items: T[],
  options: BulkSelectionOptions = {}
) {
  const bulkSelection = useBulkSelection(items, options)

  // Select high confidence items (90%+)
  const selectHighConfidence = useCallback(() => {
    bulkSelection.selectByPredicate(item => (item.confidence || 0) >= 0.9)
  }, [bulkSelection])

  // Select medium confidence items (80%+)
  const selectMediumConfidence = useCallback(() => {
    bulkSelection.selectByPredicate(item => (item.confidence || 0) >= 0.8)
  }, [bulkSelection])

  // Select low confidence items (<60%)
  const selectLowConfidence = useCallback(() => {
    bulkSelection.selectByPredicate(item => (item.confidence || 0) < 0.6)
  }, [bulkSelection])

  // Auto-select high confidence items
  const autoSelectHighConfidence = useCallback(() => {
    bulkSelection.selectByPredicate(item => (item.confidence || 0) >= 0.9)
  }, [bulkSelection])

  return {
    ...bulkSelection,
    selectHighConfidence,
    selectMediumConfidence,
    selectLowConfidence,
    autoSelectHighConfidence
  }
}

export default useBulkSelection