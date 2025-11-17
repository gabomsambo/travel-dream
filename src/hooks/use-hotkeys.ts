"use client"

import { useEffect, useCallback, useRef } from 'react'

type HotkeyConfig = {
  key: string
  ctrl?: boolean
  cmd?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description?: string
  category?: string
  enabled?: boolean
}

type HotkeyOptions = {
  enableOnInputs?: boolean
  enabled?: boolean
  preventDefault?: boolean
}

export function useHotkeys(hotkeys: HotkeyConfig[], options: HotkeyOptions = {}) {
  const {
    enableOnInputs = false,
    enabled = true,
    preventDefault = true
  } = options

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    // Don't trigger shortcuts when typing in inputs (unless explicitly enabled)
    if (!enableOnInputs) {
      const target = event.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.contentEditable === 'true' ||
        target.role === 'combobox' ||
        target.role === 'textbox'
      ) {
        return
      }
    }

    for (const hotkey of hotkeys) {
      // Skip disabled hotkeys
      if (hotkey.enabled === false) continue

      // Check modifier keys - only require them if specified
      const ctrlMatch = hotkey.ctrl === undefined || hotkey.ctrl === event.ctrlKey
      const cmdMatch = hotkey.cmd === undefined || hotkey.cmd === event.metaKey
      const shiftMatch = hotkey.shift === undefined || hotkey.shift === event.shiftKey
      const altMatch = hotkey.alt === undefined || hotkey.alt === event.altKey

      if (
        event.key.toLowerCase() === hotkey.key.toLowerCase() &&
        ctrlMatch && cmdMatch && shiftMatch && altMatch
      ) {
        if (preventDefault) {
          event.preventDefault()
        }
        hotkey.action()
        break
      }
    }
  }, [hotkeys, enabled, enableOnInputs, preventDefault])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])
}

export function useNavigationHotkeys(openCommandPalette?: () => void) {
  const router = typeof window !== 'undefined' ? require('next/navigation').useRouter() : null

  useHotkeys([
    {
      key: 'i',
      cmd: true,
      action: () => router?.push('/inbox'),
      description: 'Go to Inbox',
      category: 'Navigation'
    },
    {
      key: 'r',
      cmd: true,
      action: () => router?.push('/review'),
      description: 'Go to Review',
      category: 'Navigation'
    },
    {
      key: 'l',
      cmd: true,
      action: () => router?.push('/library'),
      description: 'Go to Library',
      category: 'Navigation'
    },
    {
      key: 'a',
      cmd: true,
      shift: true,
      action: () => router?.push('/archive'),
      description: 'Go to Archive',
      category: 'Navigation'
    },
    {
      key: 'c',
      cmd: true,
      action: () => router?.push('/collections'),
      description: 'Go to Collections',
      category: 'Navigation'
    },
    {
      key: 'm',
      cmd: true,
      action: () => router?.push('/map'),
      description: 'Go to Map',
      category: 'Navigation'
    },
    {
      key: 'k',
      cmd: true,
      action: () => openCommandPalette?.(),
      description: 'Open Command Palette',
      category: 'Navigation'
    },
    // { key: 'n', cmd: true, action: () => openQuickAdd() }, // TODO: implement quick add
  ])
}

// Inbox-specific hotkeys hook
export function useInboxHotkeys({
  onNavigateDown,
  onNavigateUp,
  onConfirmCurrent,
  onArchiveCurrent,
  onConfirmSelected,
  onArchiveSelected,
  onToggleSelection,
  onSelectAll,
  onSelectNone,
  onEdit,
  onMerge,
  onToggleKeyboardHints,
  enabled = true
}: {
  onNavigateDown?: () => void
  onNavigateUp?: () => void
  onConfirmCurrent?: () => void
  onArchiveCurrent?: () => void
  onConfirmSelected?: () => void
  onArchiveSelected?: () => void
  onToggleSelection?: () => void
  onSelectAll?: () => void
  onSelectNone?: () => void
  onEdit?: () => void
  onMerge?: () => void
  onToggleKeyboardHints?: () => void
  enabled?: boolean
}) {
  useHotkeys([
    // Navigation
    {
      key: 'j',
      action: () => onNavigateDown?.(),
      description: 'Navigate to next item',
      category: 'Navigation',
      enabled
    },
    {
      key: 'k',
      action: () => onNavigateUp?.(),
      description: 'Navigate to previous item',
      category: 'Navigation',
      enabled
    },
    {
      key: 'ArrowDown',
      action: () => onNavigateDown?.(),
      description: 'Navigate to next item',
      category: 'Navigation',
      enabled
    },
    {
      key: 'ArrowUp',
      action: () => onNavigateUp?.(),
      description: 'Navigate to previous item',
      category: 'Navigation',
      enabled
    },

    // Item Actions
    {
      key: 'c',
      action: () => onConfirmCurrent?.(),
      description: 'Confirm current item',
      category: 'Actions',
      enabled
    },
    {
      key: 'x',
      action: () => onArchiveCurrent?.(),
      description: 'Archive current item',
      category: 'Actions',
      enabled
    },
    {
      key: 'e',
      action: () => onEdit?.(),
      description: 'Edit current item',
      category: 'Actions',
      enabled
    },
    {
      key: 'm',
      action: () => onMerge?.(),
      description: 'Merge current item',
      category: 'Actions',
      enabled
    },

    // Bulk Actions
    {
      key: 'C',
      shift: true,
      action: () => onConfirmSelected?.(),
      description: 'Confirm all selected items',
      category: 'Bulk Actions',
      enabled
    },
    {
      key: 'X',
      shift: true,
      action: () => onArchiveSelected?.(),
      description: 'Archive all selected items',
      category: 'Bulk Actions',
      enabled
    },

    // Selection
    {
      key: ' ',
      action: () => onToggleSelection?.(),
      description: 'Toggle selection of current item',
      category: 'Selection',
      enabled
    },
    {
      key: 'a',
      ctrl: true,
      action: () => onSelectAll?.(),
      description: 'Select all items',
      category: 'Selection',
      enabled
    },
    {
      key: 'a',
      cmd: true,
      action: () => onSelectAll?.(),
      description: 'Select all items',
      category: 'Selection',
      enabled
    },
    {
      key: 'Escape',
      action: () => onSelectNone?.(),
      description: 'Clear selection',
      category: 'Selection',
      enabled
    },

    // Help
    {
      key: '?',
      action: () => onToggleKeyboardHints?.(),
      description: 'Toggle keyboard shortcuts help',
      category: 'Help',
      enabled
    },
  ], { enabled })
}

// Focus management utilities
export function useFocusManagement() {
  const focusMainContent = useCallback(() => {
    const mainContent = document.querySelector('main, [role="main"]') as HTMLElement
    if (mainContent) {
      mainContent.focus()
      mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const focusFirstFocusable = useCallback((container?: HTMLElement) => {
    const root = container || document
    const focusable = root.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement
    if (focusable) {
      focusable.focus()
    }
  }, [])

  const trapFocus = useCallback((container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement?.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement?.focus()
          }
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    focusMainContent,
    focusFirstFocusable,
    trapFocus
  }
}

// Accessibility announcements
export function useAccessibilityAnnouncements() {
  const announceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Create live region for screen reader announcements
    if (!announceRef.current) {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.setAttribute('aria-atomic', 'true')
      liveRegion.style.position = 'absolute'
      liveRegion.style.left = '-10000px'
      liveRegion.style.width = '1px'
      liveRegion.style.height = '1px'
      liveRegion.style.overflow = 'hidden'
      document.body.appendChild(liveRegion)
      announceRef.current = liveRegion
    }

    return () => {
      if (announceRef.current) {
        document.body.removeChild(announceRef.current)
        announceRef.current = null
      }
    }
  }, [])

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announceRef.current) {
      announceRef.current.setAttribute('aria-live', priority)
      announceRef.current.textContent = message

      // Clear the message after a delay to ensure it can be announced again
      setTimeout(() => {
        if (announceRef.current) {
          announceRef.current.textContent = ''
        }
      }, 1000)
    }
  }, [])

  return { announce }
}

// Hotkey help utilities
export function getHotkeyHelp(hotkeys: HotkeyConfig[]) {
  const categories = hotkeys.reduce((acc, hotkey) => {
    if (!hotkey.description || hotkey.enabled === false) return acc

    const category = hotkey.category || 'General'
    if (!acc[category]) {
      acc[category] = []
    }

    const keyDisplay = [
      hotkey.ctrl && 'Ctrl',
      hotkey.cmd && 'Cmd',
      hotkey.shift && 'Shift',
      hotkey.alt && 'Alt',
      hotkey.key === ' ' ? 'Space' : hotkey.key.toUpperCase()
    ].filter(Boolean).join(' + ')

    acc[category].push({
      key: keyDisplay,
      description: hotkey.description
    })

    return acc
  }, {} as Record<string, Array<{ key: string; description: string }>>)

  return categories
}
